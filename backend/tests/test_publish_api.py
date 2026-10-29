import base64
import hashlib
import json
import logging
import re
import uuid
from urllib.parse import unquote

import httpx
import pytest
from httpx import AsyncClient
from pydantic import SecretStr

from app.api.v1.publish import get_github_client
from app.config import settings
from app.main import app
from app.services.publishing import GitHubClient, build_front_matter, validate_path
from tests.conftest import auth_headers

TOKEN = "ghp_SUPER_SECRET_TOKEN_123"
REPO = "curavine/curavine-docs"


class FakeGitHub:
    """Just enough of the Contents API to publish against, held in memory."""

    def __init__(self) -> None:
        self.files: dict[str, tuple[str, bytes]] = {}  # path -> (blob sha, bytes)
        self.commits: list[dict] = []
        self.requests: list[httpx.Request] = []
        self.fail_with: int | None = None
        self.raise_exc: Exception | None = None
        self.branch_exists = True

    def edit_remotely(self, path: str, text: str) -> None:
        self.files[path] = (hashlib.sha1(text.encode()).hexdigest(), text.encode())

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.raise_exc is not None:
            raise self.raise_exc
        if self.fail_with is not None:
            return httpx.Response(self.fail_with, json={"message": f"token {TOKEN} failed"})

        url = request.url.path
        prefix = f"/repos/{REPO}/"
        assert url.startswith(prefix)
        rest = unquote(url[len(prefix) :])

        if rest.startswith("branches/"):
            return httpx.Response(200 if self.branch_exists else 404, json={"name": "main"})

        path = rest.removeprefix("contents/")
        if request.method == "GET":
            if not self.branch_exists:
                return httpx.Response(404, json={"message": "Not Found"})
            if path in self.files:
                return httpx.Response(200, json={"sha": self.files[path][0], "path": path})
            return httpx.Response(404, json={"message": "Not Found"})

        assert request.method == "PUT"
        body = json.loads(request.content)
        existing = self.files.get(path)
        if existing is not None and body.get("sha") != existing[0]:
            return httpx.Response(422, json={"message": "sha does not match"})
        if existing is None and "sha" in body:
            return httpx.Response(422, json={"message": "sha supplied for a new file"})

        raw = base64.b64decode(body["content"])
        blob_sha = hashlib.sha1(raw + str(len(self.commits)).encode()).hexdigest()
        commit_sha = hashlib.sha1(f"c{len(self.commits)}".encode()).hexdigest()
        self.files[path] = (blob_sha, raw)
        self.commits.append(
            {
                "path": path,
                "message": body["message"],
                "text": raw.decode(),
                "branch": body["branch"],
            }
        )
        return httpx.Response(
            201 if existing is None else 200,
            json={"content": {"sha": blob_sha}, "commit": {"sha": commit_sha}},
        )


@pytest.fixture
def github(monkeypatch) -> FakeGitHub:
    fake = FakeGitHub()
    monkeypatch.setattr(settings, "github_token", SecretStr(TOKEN))
    monkeypatch.setattr(settings, "github_repo", REPO)
    monkeypatch.setattr(settings, "github_branch", "main")
    monkeypatch.setattr(settings, "github_base_path", "")
    app.dependency_overrides[get_github_client] = lambda: GitHubClient(
        TOKEN, REPO, "main", transport=httpx.MockTransport(fake.handler)
    )
    yield fake
    app.dependency_overrides.pop(get_github_client, None)


@pytest.fixture
def alice_email() -> str:
    return f"alice-{uuid.uuid4()}@example.com"


@pytest.fixture
def bob_email() -> str:
    return f"bob-{uuid.uuid4()}@example.com"


def doc_content(text: str = "Hello") -> dict:
    return {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": text}]}
        ],
    }


async def make_doc(client: AsyncClient, email: str, title: str = "Tech Stack") -> str:
    response = await client.post(
        "/api/v1/documents",
        json={"title": title, "content": doc_content()},
        headers=auth_headers(email),
    )
    return response.json()["id"]


async def share(client, owner, doc_id, email, permission) -> None:
    await client.get("/api/v1/me", headers=auth_headers(email))
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": email, "permission": permission},
        headers=auth_headers(owner),
    )


async def publish(client, email, doc_id, path="docs/tech-stack.md", overwrite=False):
    return await client.post(
        f"/api/v1/documents/{doc_id}/publish",
        json={"path": path, "overwrite": overwrite},
        headers=auth_headers(email),
    )


async def test_first_publish_creates_the_file(client, github, alice_email):
    doc_id = await make_doc(client, alice_email)

    response = await publish(client, alice_email, doc_id)

    assert response.status_code == 200
    body = response.json()
    assert body["path"] == "docs/tech-stack.md"
    assert body["commit_url"].startswith(f"https://github.com/{REPO}/commit/")
    assert "docs/tech-stack.md" in github.files
    commit = github.commits[0]
    assert commit["branch"] == "main"
    me = (await client.get("/api/v1/me", headers=auth_headers(alice_email))).json()
    assert commit["message"] == f"Publish: Tech Stack (by {me['display_name']})"
    assert "# Hello" in commit["text"]


async def test_the_second_publish_updates_using_the_current_sha(client, github, alice_email):
    doc_id = await make_doc(client, alice_email)
    first = await publish(client, alice_email, doc_id)

    response = await publish(client, alice_email, doc_id)

    assert response.status_code == 200
    assert len(github.commits) == 2
    puts = [r for r in github.requests if r.method == "PUT"]
    assert "sha" not in json.loads(puts[0].content)
    assert json.loads(puts[1].content)["sha"] == first.json()["blob_sha"]


async def test_a_change_made_in_github_is_a_conflict(client, github, alice_email):
    doc_id = await make_doc(client, alice_email)
    await publish(client, alice_email, doc_id)
    github.edit_remotely("docs/tech-stack.md", "someone else's edit")

    response = await publish(client, alice_email, doc_id)

    assert response.status_code == 409
    assert response.json()["detail"] == "This file was changed in GitHub since the last publish."
    assert len(github.commits) == 1


async def test_overwrite_replaces_a_changed_file(client, github, alice_email):
    doc_id = await make_doc(client, alice_email)
    await publish(client, alice_email, doc_id)
    github.edit_remotely("docs/tech-stack.md", "someone else's edit")

    response = await publish(client, alice_email, doc_id, overwrite=True)

    assert response.status_code == 200
    assert "# Hello" in github.files["docs/tech-stack.md"][1].decode()


async def test_a_file_that_already_exists_but_was_never_ours_is_a_conflict(
    client, github, alice_email
):
    github.edit_remotely("docs/tech-stack.md", "written by hand")
    doc_id = await make_doc(client, alice_email)

    first = await publish(client, alice_email, doc_id)
    forced = await publish(client, alice_email, doc_id, overwrite=True)

    assert first.status_code == 409
    assert forced.status_code == 200


async def test_changing_the_path_publishes_to_the_new_file(client, github, alice_email):
    doc_id = await make_doc(client, alice_email)
    await publish(client, alice_email, doc_id, path="docs/a.md")

    response = await publish(client, alice_email, doc_id, path="docs/b.md")

    assert response.status_code == 200
    assert {"docs/a.md", "docs/b.md"} <= set(github.files)
    status = await client.get(
        f"/api/v1/documents/{doc_id}/publish", headers=auth_headers(alice_email)
    )
    assert status.json()["path"] == "docs/b.md"


async def test_a_stale_sha_at_write_time_is_also_a_conflict(
    client, github, alice_email, monkeypatch
):
    """Someone commits between our look and our write; GitHub rejects the PUT."""
    doc_id = await make_doc(client, alice_email)
    await publish(client, alice_email, doc_id)

    original = github.handler

    def racing(request: httpx.Request) -> httpx.Response:
        if request.method == "PUT":
            github.edit_remotely("docs/tech-stack.md", "raced")
        return original(request)

    app.dependency_overrides[get_github_client] = lambda: GitHubClient(
        TOKEN, REPO, "main", transport=httpx.MockTransport(racing)
    )

    response = await publish(client, alice_email, doc_id)

    assert response.status_code == 409


async def test_a_viewer_and_a_commenter_may_not_publish(client, github, alice_email, bob_email):
    doc_id = await make_doc(client, alice_email)
    carol = f"carol-{uuid.uuid4()}@example.com"
    await share(client, alice_email, doc_id, bob_email, "view")
    await share(client, alice_email, doc_id, carol, "comment")

    assert (await publish(client, bob_email, doc_id)).status_code == 403
    assert (await publish(client, carol, doc_id)).status_code == 403
    assert github.requests == []


async def test_an_editor_may_publish(client, github, alice_email, bob_email):
    doc_id = await make_doc(client, alice_email)
    await share(client, alice_email, doc_id, bob_email, "edit")

    assert (await publish(client, bob_email, doc_id)).status_code == 200


async def test_a_stranger_gets_a_404_not_a_403(client, github, alice_email, bob_email):
    doc_id = await make_doc(client, alice_email)
    await client.get("/api/v1/me", headers=auth_headers(bob_email))

    assert (await publish(client, bob_email, doc_id)).status_code == 404


async def test_status_says_who_can_publish(client, github, alice_email, bob_email):
    doc_id = await make_doc(client, alice_email)
    await share(client, alice_email, doc_id, bob_email, "view")

    owner = (
        await client.get(f"/api/v1/documents/{doc_id}/publish", headers=auth_headers(alice_email))
    ).json()
    viewer = (
        await client.get(f"/api/v1/documents/{doc_id}/publish", headers=auth_headers(bob_email))
    ).json()

    assert owner["configured"] is True and owner["can_publish"] is True
    assert viewer["can_publish"] is False
    assert owner["path"] == "docs/Tech-Stack.md"
    assert owner["is_published"] is False


async def test_status_shows_the_last_publish_to_a_viewer(client, github, alice_email, bob_email):
    doc_id = await make_doc(client, alice_email)
    await share(client, alice_email, doc_id, bob_email, "view")
    await publish(client, alice_email, doc_id)

    status = (
        await client.get(f"/api/v1/documents/{doc_id}/publish", headers=auth_headers(bob_email))
    ).json()

    assert status["is_published"] is True
    assert status["last_published_at"]
    assert status["last_published_by"]["display_name"]
    assert status["file_url"] == f"https://github.com/{REPO}/blob/main/docs/tech-stack.md"


async def test_not_configured_is_a_503_and_status_says_so(client, alice_email, monkeypatch):
    monkeypatch.setattr(settings, "github_token", SecretStr(""))
    monkeypatch.setattr(settings, "github_repo", "")
    doc_id = await make_doc(client, alice_email)

    response = await publish(client, alice_email, doc_id)
    status = await client.get(
        f"/api/v1/documents/{doc_id}/publish", headers=auth_headers(alice_email)
    )

    assert response.status_code == 503
    assert "not set up" in response.json()["detail"]
    assert status.json()["configured"] is False
    assert status.json()["can_publish"] is False


async def test_the_token_never_appears_in_responses_or_logs(client, github, alice_email, caplog):
    caplog.set_level(logging.DEBUG)
    doc_id = await make_doc(client, alice_email)
    seen = []

    seen.append(await publish(client, alice_email, doc_id))
    github.edit_remotely("docs/tech-stack.md", "x")
    seen.append(await publish(client, alice_email, doc_id))
    for code in (401, 403, 404, 500):
        github.fail_with = code
        seen.append(await publish(client, alice_email, doc_id))
    github.fail_with = None
    seen.append(
        await client.get(f"/api/v1/documents/{doc_id}/publish", headers=auth_headers(alice_email))
    )
    seen.append(
        await client.get(
            f"/api/v1/documents/{doc_id}/publications", headers=auth_headers(alice_email)
        )
    )
    seen.append(await client.get("/api/v1/features", headers=auth_headers(alice_email)))

    for response in seen:
        assert TOKEN not in response.text
        assert TOKEN not in str(dict(response.headers))
    assert TOKEN not in caplog.text


@pytest.mark.parametrize(
    ("upstream", "status", "fragment"),
    [
        (401, 502, "token was rejected"),
        (403, 502, "refused"),
        (500, 502, "unexpected error"),
    ],
)
async def test_github_failures_get_clear_messages(
    client, github, alice_email, upstream, status, fragment
):
    doc_id = await make_doc(client, alice_email)
    github.fail_with = upstream

    response = await publish(client, alice_email, doc_id)

    assert response.status_code == status
    assert fragment in response.json()["detail"]


async def test_a_missing_repository_or_branch_is_reported(client, github, alice_email):
    doc_id = await make_doc(client, alice_email)
    github.branch_exists = False

    response = await publish(client, alice_email, doc_id)

    assert response.status_code == 502
    assert "repository or branch was not found" in response.json()["detail"]


async def test_a_timeout_is_a_504(client, github, alice_email):
    doc_id = await make_doc(client, alice_email)
    github.raise_exc = httpx.ReadTimeout("slow")

    response = await publish(client, alice_email, doc_id)

    assert response.status_code == 504
    assert "did not respond in time" in response.json()["detail"]


async def test_an_unreachable_github_is_a_502(client, github, alice_email):
    doc_id = await make_doc(client, alice_email)
    github.raise_exc = httpx.ConnectError("down")

    assert (await publish(client, alice_email, doc_id)).status_code == 502


async def test_the_file_carries_correct_front_matter(client, github, alice_email):
    doc_id = await make_doc(client, alice_email, title='Plan: "v2"')

    await publish(client, alice_email, doc_id, path="docs/plan.md")

    text = github.commits[0]["text"]
    head, _, rest = text.partition("\n---\n")
    lines = head.removeprefix("---\n").splitlines()
    fields = {line.split(": ", 1)[0]: json.loads(line.split(": ", 1)[1]) for line in lines}
    assert fields["folium_document_id"] == doc_id
    assert fields["title"] == 'Plan: "v2"'
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", fields["published_at"])
    assert fields["published_by"].endswith(f"<{alice_email}>")
    assert rest.lstrip().startswith("# Hello")


async def test_the_front_matter_names_the_latest_version_when_there_is_one():
    vid = uuid.uuid4()
    from datetime import UTC, datetime

    with_version = build_front_matter(
        document_id=uuid.uuid4(),
        title="t",
        published_at=datetime.now(UTC),
        published_by="a",
        version_id=vid,
    )
    without = build_front_matter(
        document_id=uuid.uuid4(),
        title="t",
        published_at=datetime.now(UTC),
        published_by="a",
        version_id=None,
    )
    assert f'folium_version_id: "{vid}"' in with_version
    assert "folium_version_id" not in without


async def test_an_urdu_title_gives_a_valid_path_and_survives_in_the_file(
    client, github, alice_email
):
    title = "ڈیزائن دستاویز"
    doc_id = await make_doc(client, alice_email, title=title)
    suggested = (
        await client.get(f"/api/v1/documents/{doc_id}/publish", headers=auth_headers(alice_email))
    ).json()["path"]

    assert validate_path(suggested) == suggested
    assert suggested.endswith(".md") and "ڈیزائن" in suggested

    response = await publish(client, alice_email, doc_id, path=suggested)

    assert response.status_code == 200
    assert suggested in github.files
    assert f"title: {json.dumps(title, ensure_ascii=False)}" in github.commits[0]["text"]
    put = next(r for r in github.requests if r.method == "PUT")
    assert "ڈیزائن" not in str(put.url)  # percent-encoded on the wire


@pytest.mark.parametrize(
    "bad",
    [
        "",
        "   ",
        "/abs.md",
        "../x.md",
        "docs/../x.md",
        "a//b.md",
        "a\\b.md",
        "x.txt",
        "docs/.md",
        ".git/x.md",
        "a/./b.md",
        "bad\x00.md",
        "a" * 250 + ".md",
    ],
)
async def test_unsafe_paths_are_rejected(client, github, alice_email, bad):
    doc_id = await make_doc(client, alice_email)

    response = await publish(client, alice_email, doc_id, path=bad)

    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)
    assert github.requests == []


async def test_the_base_path_is_prefixed_but_not_shown(client, github, alice_email, monkeypatch):
    monkeypatch.setattr(settings, "github_base_path", "design")
    doc_id = await make_doc(client, alice_email)

    response = await publish(client, alice_email, doc_id, path="tech.md")

    assert response.json()["path"] == "tech.md"
    assert "design/tech.md" in github.files


async def test_history_lists_every_publish_newest_first(client, github, alice_email, bob_email):
    doc_id = await make_doc(client, alice_email)
    await share(client, alice_email, doc_id, bob_email, "view")
    await publish(client, alice_email, doc_id, path="docs/one.md")
    await publish(client, alice_email, doc_id, path="docs/two.md")

    rows = (
        await client.get(
            f"/api/v1/documents/{doc_id}/publications", headers=auth_headers(bob_email)
        )
    ).json()

    assert [r["path"] for r in rows] == ["docs/two.md", "docs/one.md"]
    assert rows[0]["published_by"]["display_name"]
    assert rows[0]["commit_url"].startswith(f"https://github.com/{REPO}/commit/")


async def test_features_reports_booleans_only(client, github, alice_email):
    response = await client.get("/api/v1/features", headers=auth_headers(alice_email))

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"collaboration", "attachments", "github_publish"}
    assert all(isinstance(v, bool) for v in body.values())
    assert body["github_publish"] is True


async def test_features_requires_sign_in(client):
    assert (await client.get("/api/v1/features")).status_code == 401


async def test_features_follow_the_settings(client, alice_email, monkeypatch):
    monkeypatch.setattr(settings, "y_sweet_connection_string", "")
    monkeypatch.setattr(settings, "supabase_service_role_key", "")
    monkeypatch.setattr(settings, "github_token", SecretStr(""))
    monkeypatch.setattr(settings, "github_repo", "")
    off = (await client.get("/api/v1/features", headers=auth_headers(alice_email))).json()

    monkeypatch.setattr(settings, "y_sweet_connection_string", "ys://secret-token@host")
    monkeypatch.setattr(settings, "supabase_service_role_key", "service-role-secret")
    monkeypatch.setattr(settings, "github_token", SecretStr(TOKEN))
    monkeypatch.setattr(settings, "github_repo", REPO)
    response = await client.get("/api/v1/features", headers=auth_headers(alice_email))

    assert off == {"collaboration": False, "attachments": False, "github_publish": False}
    assert response.json() == {"collaboration": True, "attachments": True, "github_publish": True}
    for secret in ("secret-token", "service-role-secret", TOKEN):
        assert secret not in response.text

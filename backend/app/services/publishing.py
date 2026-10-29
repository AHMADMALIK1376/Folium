"""Publish a document to a GitHub repository as Markdown (Phase 22).

The one place that knows how a document becomes a commit. Three concerns, kept
apart so each can be tested without the others: the pure shaping of paths and
file contents, the HTTP conversation with GitHub, and the decision about whether
a publish is safe.

The token is read here and nowhere else, only ever placed in an Authorization
header, and never formatted into a log line or an error. GitHub's own response
bodies are not forwarded to callers either: they are re-expressed in our words,
so a message that happened to echo a credential could not reach a browser.
"""

import base64
import json
import logging
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import quote
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import FoliumError, PermissionDeniedError, ValidationError
from app.models import Document, DocumentVersion, Publication, User
from app.services import documents as documents_service
from app.services.permissions import can_edit
from app.utils.import_file import doc_to_markdown

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"
GITHUB_TIMEOUT_SECONDS = 10.0
MAX_PATH_LENGTH = 240


class PublishingError(FoliumError):
    """A publish failed in a way the caller should be told about, with a status."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


REMOTE_CHANGED_MESSAGE = "This file was changed in GitHub since the last publish."


# --- pure shaping ------------------------------------------------------------


def validate_path(raw: str) -> str:
    """Check a repo-relative file path and return it cleaned. Raises ValueError.

    Rejected rather than quietly repaired: a path that silently became a
    different path would commit a file somewhere the person did not choose.
    Unicode is welcome -- the filename of a document written in Urdu should be
    Urdu -- but control characters, traversal and a hidden `.git` are not.
    """
    path = (raw or "").strip()
    if not path:
        raise ValueError("Enter a file path, for example docs/tech-stack.md")
    if len(path) > MAX_PATH_LENGTH:
        raise ValueError(f"The path is too long (at most {MAX_PATH_LENGTH} characters)")
    if path.startswith("/"):
        raise ValueError("The path must be relative to the repository, with no leading /")
    if "\\" in path:
        raise ValueError("Use / between folders, not \\")
    if any(unicodedata.category(c).startswith("C") for c in path):
        raise ValueError("The path contains characters that are not allowed")

    parts = path.split("/")
    if any(p == "" for p in parts):
        raise ValueError("The path has an empty folder name")
    if any(p in (".", "..") or p.lower() == ".git" for p in parts):
        raise ValueError("The path may not contain ., .. or .git")
    if not path.lower().endswith(".md") or parts[-1].lower() == ".md":
        raise ValueError("The file name must end in .md")

    return path


def full_path(relative: str) -> str:
    """The path inside the repo: the configured base folder, then the user's path."""
    base = settings.github_base_path
    return f"{base}/{relative}" if base else relative


def _scalar(value: str) -> str:
    # A JSON string is a valid YAML double-quoted scalar, so colons, quotes,
    # newlines and non-Latin scripts in a title are all safe without a YAML
    # library -- which would be a dependency for exactly this one line.
    return json.dumps(value, ensure_ascii=False)


def build_front_matter(
    *,
    document_id: UUID,
    title: str,
    published_at: datetime,
    published_by: str,
    version_id: UUID | None,
) -> str:
    stamp = published_at.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = [
        "---",
        f"folium_document_id: {_scalar(str(document_id))}",
        f"title: {_scalar(title)}",
        f"published_at: {_scalar(stamp)}",
        f"published_by: {_scalar(published_by)}",
    ]
    if version_id is not None:
        lines.append(f"folium_version_id: {_scalar(str(version_id))}")
    lines.append("---")
    return "\n".join(lines) + "\n"


def commit_message(title: str, who: str) -> str:
    one_line = " ".join((title or "").split())[:200] or "Untitled"
    return f"Publish: {one_line} (by {who})"


# --- GitHub ------------------------------------------------------------------


@dataclass(frozen=True)
class GitHubCommit:
    commit_sha: str
    blob_sha: str


class GitHubClient:
    """The few GitHub Contents-API calls publishing needs.

    A transport can be injected, which is how the tests stand in for GitHub
    without any network. Nothing else about it is test-shaped.
    """

    def __init__(
        self,
        token: str,
        repo: str,
        branch: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._token = token
        self.repo = repo
        self.branch = branch
        self._transport = transport

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=GITHUB_API,
            timeout=GITHUB_TIMEOUT_SECONDS,
            transport=self._transport,
            headers={
                "Authorization": f"Bearer {self._token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "folium-publisher",
            },
        )

    def _contents_url(self, path: str) -> str:
        return f"/repos/{self.repo}/contents/{quote(path, safe='/')}"

    async def _send(self, method: str, url: str, **kwargs) -> httpx.Response:
        try:
            async with self._client() as client:
                return await client.request(method, url, **kwargs)
        except httpx.TimeoutException as exc:
            logger.warning("github request timed out: %s", type(exc).__name__)
            raise PublishingError(504, "GitHub did not respond in time. Try again.") from None
        except httpx.HTTPError as exc:
            logger.warning("github request failed: %s", type(exc).__name__)
            raise PublishingError(502, "Could not reach GitHub. Try again.") from None

    @staticmethod
    def _fail(response: httpx.Response) -> PublishingError:
        status = response.status_code
        logger.warning("github answered %s", status)
        if status == 401:
            return PublishingError(
                502, "Folium's GitHub token was rejected. Ask an administrator to renew it."
            )
        if status == 403:
            return PublishingError(
                502,
                "GitHub refused the request: the token lacks access to this repository, "
                "or the rate limit was reached.",
            )
        if status == 404:
            return PublishingError(502, "The GitHub repository or branch was not found.")
        return PublishingError(502, f"GitHub returned an unexpected error ({status}).")

    async def file_sha(self, path: str) -> str | None:
        """The blob sha of the file on the branch, or None if it does not exist."""
        response = await self._send("GET", self._contents_url(path), params={"ref": self.branch})
        if response.status_code == 200:
            body = response.json()
            if isinstance(body, list):
                raise PublishingError(422, "That path is a folder in the repository.")
            return str(body["sha"])
        if response.status_code == 404:
            # GitHub answers 404 both for "no such file" and "no such repo or
            # branch". Only the first is normal, so tell them apart.
            branch = await self._send("GET", f"/repos/{self.repo}/branches/{quote(self.branch)}")
            if branch.status_code == 200:
                return None
            raise self._fail(branch)
        raise self._fail(response)

    async def put_file(
        self, path: str, content: bytes, message: str, sha: str | None
    ) -> GitHubCommit:
        payload: dict[str, str] = {
            "message": message,
            "content": base64.b64encode(content).decode("ascii"),
            "branch": self.branch,
        }
        if sha is not None:
            payload["sha"] = sha

        response = await self._send("PUT", self._contents_url(path), json=payload)
        if response.status_code in (200, 201):
            body = response.json()
            return GitHubCommit(
                commit_sha=str(body["commit"]["sha"]), blob_sha=str(body["content"]["sha"])
            )
        if response.status_code in (409, 422):
            # The sha we held went stale between looking and writing: someone
            # else got there first. Same answer as finding it changed up front.
            logger.warning("github rejected the write as a conflict (%s)", response.status_code)
            raise PublishingError(409, REMOTE_CHANGED_MESSAGE)
        raise self._fail(response)


def make_github_client() -> GitHubClient:
    """The client for the configured repository. Callers check `enabled` first."""
    return GitHubClient(
        token=settings.github_token.get_secret_value(),
        repo=settings.github_repo,
        branch=settings.github_branch,
    )


def require_enabled() -> None:
    if not settings.github_publish_enabled:
        raise PublishingError(503, "Publishing to GitHub is not set up on this server.")


def commit_url(commit_sha: str) -> str:
    return f"https://github.com/{settings.github_repo}/commit/{commit_sha}"


def file_url(path: str) -> str:
    branch = quote(settings.github_branch)
    return f"https://github.com/{settings.github_repo}/blob/{branch}/{quote(path, safe='/')}"


# --- the decision ------------------------------------------------------------


@dataclass(frozen=True)
class PublishResult:
    path: str
    commit_sha: str
    blob_sha: str
    published_at: datetime
    published_by: User


async def publish_document(
    db: AsyncSession,
    github: GitHubClient,
    document_id: UUID,
    user: User,
    path: str,
    overwrite: bool,
) -> PublishResult:
    require_enabled()

    # Access first, so a stranger gets the usual 404 and learns nothing. Only
    # someone who can already open the document reaches the 403 below, so it
    # confirms nothing they could not see.
    document, permission = await documents_service.get_document(db, document_id, user.id)
    if not can_edit(permission):
        raise PermissionDeniedError("Only people who can edit this document may publish it.")

    try:
        relative = validate_path(path)
    except ValueError as exc:
        raise ValidationError(str(exc)) from None
    target = full_path(relative)

    now = datetime.now(UTC)
    newest = await db.execute(
        select(DocumentVersion.id)
        .where(DocumentVersion.document_id == document.id)
        .order_by(DocumentVersion.created_at.desc())
        .limit(1)
    )
    who = f"{user.display_name} <{user.email}>"
    front_matter = build_front_matter(
        document_id=document.id,
        title=document.title,
        published_at=now,
        published_by=who,
        version_id=newest.scalar_one_or_none(),
    )
    body = front_matter + "\n" + doc_to_markdown(document.content).rstrip("\n") + "\n"

    remote_sha = await github.file_sha(target)

    # The sha we recorded describes the file at the path we published to. If the
    # path has changed it says nothing about the new one, so a file already
    # sitting there is by definition not ours.
    expected = document.last_published_blob_sha if document.github_path == relative else None
    if remote_sha is not None and remote_sha != expected and not overwrite:
        raise PublishingError(409, REMOTE_CHANGED_MESSAGE)

    commit = await github.put_file(
        target, body.encode("utf-8"), commit_message(document.title, user.display_name), remote_sha
    )

    try:
        document.github_path = relative
        document.last_published_blob_sha = commit.blob_sha
        document.last_published_at = now
        document.last_published_by = user.id
        db.add(
            Publication(
                document_id=document.id,
                user_id=user.id,
                path=target,
                commit_sha=commit.commit_sha,
                blob_sha=commit.blob_sha,
                published_at=now,
            )
        )
        await db.commit()
    except Exception:
        # GitHub already has the commit. Say which, so it can be reconciled; the
        # next publish will find a sha mismatch and offer Overwrite, which is
        # safe if noisy.
        logger.exception("published to GitHub but failed to record it: %s", commit.commit_sha)
        raise

    return PublishResult(
        path=relative,
        commit_sha=commit.commit_sha,
        blob_sha=commit.blob_sha,
        published_at=now,
        published_by=user,
    )


async def list_publications(
    db: AsyncSession, document_id: UUID, user_id: UUID
) -> list[tuple[Publication, User | None]]:
    """The document's publish history, newest first. Follows *view*."""
    await documents_service.get_document(db, document_id, user_id)
    result = await db.execute(
        select(Publication, User)
        .outerjoin(User, User.id == Publication.user_id)
        .where(Publication.document_id == document_id)
        .order_by(Publication.published_at.desc())
    )
    return [(row[0], row[1]) for row in result.all()]


async def publisher_of(db: AsyncSession, document: Document) -> User | None:
    if document.last_published_by is None:
        return None
    return await db.get(User, document.last_published_by)

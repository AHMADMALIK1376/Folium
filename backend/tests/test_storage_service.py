"""The storage boundary, tested without a bucket, a key, or a network.

Every request is intercepted by an httpx MockTransport, so these assert the
exact shape of what would go to Supabase — which is the part that cannot be
checked any other way short of a live project.
"""

import httpx
import pytest

from app.config import settings
from app.services import storage


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "https://abc.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "service-key")


@pytest.fixture
def capture(monkeypatch):
    """Replace the network with a recorder, returning the requests made."""
    seen: list[httpx.Request] = []

    def install(handler):
        transport = httpx.MockTransport(lambda request: (seen.append(request), handler(request))[1])
        original = httpx.AsyncClient

        def factory(*args, **kwargs):
            kwargs["transport"] = transport
            return original(*args, **kwargs)

        monkeypatch.setattr(httpx, "AsyncClient", factory)
        return seen

    return install


async def test_upload_targets_the_bucket_and_carries_the_key(configured, capture):
    seen = capture(lambda _: httpx.Response(200, json={"Key": "attachments/x"}))

    await storage.upload("doc-1/att-1.png", b"bytes", "image/png")

    request = seen[0]
    assert request.method == "POST"
    assert str(request.url) == "https://abc.supabase.co/storage/v1/object/attachments/doc-1/att-1.png"
    assert request.headers["authorization"] == "Bearer service-key"
    assert request.headers["content-type"] == "image/png"
    assert request.content == b"bytes"


async def test_signed_url_is_absolute(configured, capture):
    """Storage answers with a path relative to /storage/v1, not a URL.

    Handing that to a browser unchanged produces a request to the frontend's own
    origin, which 404s in a way that looks like the file is missing.
    """
    capture(lambda _: httpx.Response(200, json={"signedURL": "/object/sign/attachments/a.png?token=t"}))

    url = await storage.signed_url("a.png")

    assert url == "https://abc.supabase.co/storage/v1/object/sign/attachments/a.png?token=t"


async def test_signed_url_asks_for_a_short_life(configured, capture):
    seen = capture(lambda _: httpx.Response(200, json={"signedURL": "/x"}))

    await storage.signed_url("a.png", expires_in=60)

    assert b'"expiresIn":60' in seen[0].content.replace(b" ", b"")


async def test_remove_sends_every_path_in_one_request(configured, capture):
    seen = capture(lambda _: httpx.Response(200, json={}))

    await storage.remove(["a.png", "b.pdf"])

    body = seen[0].content.decode()
    assert "a.png" in body and "b.pdf" in body
    assert seen[0].method == "DELETE"


async def test_remove_of_nothing_makes_no_request(configured, capture):
    seen = capture(lambda _: httpx.Response(500))

    await storage.remove([])

    assert seen == []


async def test_remove_tolerates_an_object_that_is_already_gone(configured, capture):
    """The caller wants the object absent, and it is."""
    capture(lambda _: httpx.Response(404, json={"error": "not_found"}))

    await storage.remove(["gone.png"])


async def test_a_refusal_becomes_a_domain_error(configured, capture):
    """Not a bare httpx error: the HTTP layer maps FoliumError subclasses, and
    an httpx exception escaping the service layer is a 500."""
    capture(lambda _: httpx.Response(500, text="boom"))

    with pytest.raises(storage.StorageUnavailableError):
        await storage.upload("a.png", b"x", "image/png")


async def test_an_unreachable_host_becomes_a_domain_error(configured, capture):
    def explode(_request):
        raise httpx.ConnectError("no route")

    capture(explode)

    with pytest.raises(storage.StorageUnavailableError):
        await storage.signed_url("a.png")


async def test_nothing_is_called_without_a_key(monkeypatch, capture):
    """A blank key would otherwise become "Bearer ", and Storage's 400 would
    read as a malformed request rather than an unconfigured deployment."""
    monkeypatch.setattr(settings, "supabase_url", "https://abc.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "")
    seen = capture(lambda _: httpx.Response(200, json={}))

    with pytest.raises(storage.StorageUnavailableError):
        await storage.upload("a.png", b"x", "image/png")

    assert seen == []


async def test_the_error_never_carries_the_key_outward(configured, capture):
    """Storage echoes the request in some error bodies. The message returned to
    a caller is fixed text, so a key cannot travel out in a 503."""
    capture(lambda _: httpx.Response(400, text="invalid key service-key"))

    with pytest.raises(storage.StorageUnavailableError) as exc:
        await storage.upload("a.png", b"x", "image/png")

    assert "service-key" not in str(exc.value)

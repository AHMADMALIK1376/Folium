from app.config import Settings


def test_supabase_urls_are_derived_from_project_url():
    s = Settings(_env_file=None, supabase_url="https://abc.supabase.co")
    assert s.jwks_url == "https://abc.supabase.co/auth/v1/.well-known/jwks.json"
    assert s.jwt_issuer == "https://abc.supabase.co/auth/v1"


def test_trailing_slash_on_project_url_is_normalised():
    s = Settings(_env_file=None, supabase_url="https://abc.supabase.co/")
    assert s.jwks_url == "https://abc.supabase.co/auth/v1/.well-known/jwks.json"
    assert s.jwt_issuer == "https://abc.supabase.co/auth/v1"


def test_audience_and_ttl_defaults():
    s = Settings(_env_file=None, supabase_url="https://abc.supabase.co")
    assert s.jwt_audience == "authenticated"
    assert s.jwks_cache_ttl_seconds == 600


def test_environment_still_defaults_to_production(monkeypatch):
    """The code default must be the safe value even with no env var set:
    an unset ENVIRONMENT must never silently enable development behaviour."""
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    assert Settings(_env_file=None).environment == "production"


def test_cors_origins_splits_a_comma_separated_list():
    s = Settings(_env_file=None, frontend_origin="http://a.test,http://b.test")
    assert s.cors_origins == ["http://a.test", "http://b.test"]


def test_cors_origins_trims_whitespace_and_drops_blanks():
    # A trailing comma would otherwise yield an empty origin, which
    # CORSMiddleware treats as a value to match against.
    s = Settings(_env_file=None, frontend_origin=" http://a.test , , http://b.test ,")
    assert s.cors_origins == ["http://a.test", "http://b.test"]


def test_cors_origins_allows_both_localhost_and_loopback_by_default():
    """A browser treats localhost and 127.0.0.1 as different origins, and
    Next.js prints both on startup. Allowing only one rejects the other's
    preflight with a 400 that looks like a server fault."""
    s = Settings(_env_file=None)
    assert "http://localhost:3000" in s.cors_origins
    assert "http://127.0.0.1:3000" in s.cors_origins


def test_cors_origins_allow_the_playwright_port_by_default():
    """The e2e suite serves its own build on 3100, away from any dev server.

    Without this the suite's server-rendered reads succeed while every
    browser-side mutation fails CORS — which presents as a broken app rather
    than a misconfigured one.
    """
    s = Settings(_env_file=None)
    assert "http://localhost:3100" in s.cors_origins


def test_a_single_origin_still_works():
    s = Settings(_env_file=None, frontend_origin="https://folium.app")
    # The permissive default is development-only: one explicit value replaces it
    # entirely, so a deployment never inherits a localhost origin.
    assert s.cors_origins == ["https://folium.app"]


def test_attachments_are_off_without_a_service_role_key():
    """Blank means off, exactly as a blank y-sweet string means off.

    CI holds no Supabase credentials, so a feature that could not be disabled
    would be a feature nobody else could run the suite against.
    """
    s = Settings(_env_file=None, supabase_url="https://abc.supabase.co")
    assert s.attachments_enabled is False


def test_attachments_need_a_project_as_well_as_a_key():
    """A key with nowhere to send it is not a working configuration."""
    assert (
        Settings(
            _env_file=None, supabase_url="", supabase_service_role_key="service-key"
        ).attachments_enabled
        is False
    )


def test_attachments_are_on_when_both_are_present():
    s = Settings(
        _env_file=None,
        supabase_url="https://abc.supabase.co",
        supabase_service_role_key="service-key",
    )
    assert s.attachments_enabled is True
    assert s.storage_url == "https://abc.supabase.co/storage/v1"


def test_whitespace_is_not_a_service_role_key():
    s = Settings(
        _env_file=None, supabase_url="https://abc.supabase.co", supabase_service_role_key="   "
    )
    assert s.attachments_enabled is False

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


def test_environment_still_defaults_to_production():
    assert Settings(_env_file=None).environment == "production"

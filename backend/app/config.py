from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://folium:folium@localhost:5433/folium"
    # Must stay "production" so an unset ENVIRONMENT fails closed. This no longer
    # gates authentication, but it does gate exposure of the interactive API docs.
    environment: str = "production"
    frontend_origin: str = "http://localhost:3000"

    # Supabase project URL, e.g. https://abc.supabase.co. The issuer and JWKS
    # URL are derived from it rather than configured separately so they cannot
    # drift apart. Deliberately no SUPABASE_SERVICE_ROLE_KEY: this service only
    # verifies tokens and never calls Supabase's admin API.
    supabase_url: str = ""

    jwks_cache_ttl_seconds: int = 600

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def _supabase_base(self) -> str:
        return self.supabase_url.rstrip("/")

    @property
    def jwt_issuer(self) -> str:
        return f"{self._supabase_base}/auth/v1"

    @property
    def jwks_url(self) -> str:
        return f"{self._supabase_base}/auth/v1/.well-known/jwks.json"

    @property
    def jwt_audience(self) -> str:
        return "authenticated"


settings = Settings()

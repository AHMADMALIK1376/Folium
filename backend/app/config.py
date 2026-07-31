from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://folium:folium@localhost:5433/folium"
    # Must stay "production" so an unset ENVIRONMENT fails closed. This no longer
    # gates authentication, but it does gate exposure of the interactive API docs.
    environment: str = "production"
    # Origins allowed to call this API from a browser. Comma-separated, because
    # `localhost` and `127.0.0.1` are different origins to a browser even though
    # they are the same machine, and Next.js prints both on startup — so a
    # single value silently rejects half the URLs a developer might open.
    #
    # Port 3100 is where the Playwright suite serves its own production build,
    # deliberately away from 3000 so a run cannot adopt — or be disrupted by — a
    # dev server. Without it here, every browser-side mutation in that suite
    # fails CORS while server-rendered reads keep working, which reads as a bug
    # in the app rather than in its configuration.
    #
    # This default is development-only. Deployments set FRONTEND_ORIGIN
    # explicitly; see DEPLOY.md.
    frontend_origin: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3100,http://127.0.0.1:3100"
    )

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
    def cors_origins(self) -> list[str]:
        """Allowed browser origins, parsed from the comma-separated setting.

        Blank entries are dropped so a trailing comma cannot produce an empty
        origin, which CORSMiddleware would treat as a value to match against.
        """
        return [o.strip() for o in self.frontend_origin.split(",") if o.strip()]

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

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
    # drift apart.
    supabase_url: str = ""

    jwks_cache_ttl_seconds: int = 600

    # Supabase service-role key, used for exactly one thing: reading and writing
    # attachment objects in Storage. It bypasses RLS, so it is the most
    # dangerous value in this file and must never reach the browser — nothing
    # here is served to the frontend, and NEXT_PUBLIC_* is the frontend's own
    # config.
    #
    # Phase 5-ii took this on deliberately, having weighed the alternative:
    # letting the browser upload straight to Storage under RLS policies would
    # need no key, but it would express Folium's ownership-plus-shares rules a
    # second time in SQL. Two implementations of one permission model drift, and
    # the first disagreement is someone reading a document they were removed
    # from. One source of truth is worth one secret.
    #
    # Blank by default, and blank means attachments are simply off — the routes
    # answer 503 and the editor omits the panel. CI holds no Supabase
    # credentials and must still run the whole suite.
    supabase_service_role_key: str = ""

    # Connection string for a y-sweet server, e.g.
    # ys://<token>@localhost:8080 locally, or the Jamsocket-issued value.
    #
    # Blank by default, and blank means collaboration is simply off: the editor
    # falls back to the single-user autosave it has had since Phase 2C-ii. A
    # deployment that has not configured this is not broken, and CI needs no
    # vendor to run the suite.
    y_sweet_connection_string: str = ""

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def collaboration_enabled(self) -> bool:
        return bool(self.y_sweet_connection_string.strip())

    @property
    def attachments_enabled(self) -> bool:
        """Attachments need both a project to talk to and a key to talk with."""
        return bool(self.supabase_service_role_key.strip() and self.supabase_url.strip())

    @property
    def storage_url(self) -> str:
        return f"{self._supabase_base}/storage/v1"

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

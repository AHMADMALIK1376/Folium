from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://folium:folium@localhost:5433/folium"
    environment: str = "development"
    frontend_origin: str = "http://localhost:3000"

    @property
    def is_development(self) -> bool:
        return self.environment == "development"


settings = Settings()

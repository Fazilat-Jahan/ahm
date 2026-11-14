from pydantic_settings import BaseSettings, SettingsConfigDict

# Browser origins on a private network (habitat LAN) or this machine, any
# port. CORS only: it decides which web pages may call this API from a
# browser, it is not authentication.
LAN_ORIGIN_REGEX = (
    r"^https?://("
    r"localhost|127\.0\.0\.1|\[::1\]"
    r"|192\.168\.\d{1,3}\.\d{1,3}"
    r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
    r")(:\d{1,5})?$"
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mode: str = "LOCAL_ONLY"  # LOCAL_ONLY | HABITAT_LAN | GROUND_SYNC
    database_url: str = "sqlite+aiosqlite:///./ahm.db"
    secret_key: str = "change-me"
    access_token_minutes: int = 720
    # Exact origins (e.g. a hosted frontend). The frontend dev/start server
    # runs on port 3100 on this project.
    cors_origins: str = "http://localhost:3100"
    # Extra origins matched by pattern; defaults to any private-LAN address.
    # Set to an empty string to allow only `cors_origins`.
    cors_origin_regex: str = LAN_ORIGIN_REGEX
    # Shared key for /sync/push and /sync/pull, typed once into each
    # trusted device. Empty = sync is switched off.
    sync_key: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()

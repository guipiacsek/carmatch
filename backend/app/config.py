import os
from dataclasses import dataclass, field


def _list(name: str, default: str = "") -> list[str]:
    return [v.strip().rstrip("/") for v in os.getenv(name, default).split(",") if v.strip()]


@dataclass(frozen=True)
class Settings:
    openai_api_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    openai_model: str = field(default_factory=lambda: os.getenv("OPENAI_MODEL", "gpt-4.1-mini"))
    supabase_url: str = field(default_factory=lambda: os.getenv("SUPABASE_URL", "").rstrip("/"))
    supabase_service_role_key: str = field(default_factory=lambda: os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
    supabase_jwt_secret: str = field(default_factory=lambda: os.getenv("SUPABASE_JWT_SECRET", ""))
    allowed_origins: list[str] = field(default_factory=lambda: _list("ALLOWED_ORIGINS", "http://localhost:5173"))
    # Optional regex, e.g. Vercel preview URLs: ^https://carmatch-.*\.vercel\.app$
    allowed_origin_regex: str | None = field(default_factory=lambda: os.getenv("ALLOWED_ORIGIN_REGEX") or None)
    rate_limit_per_hour: int = field(default_factory=lambda: int(os.getenv("RATE_LIMIT_PER_HOUR", "8")))
    # Public proxies appending to X-Forwarded-For after private hops are dropped. Render: Cloudflare + client = 2.
    trusted_proxy_hops: int = field(default_factory=lambda: int(os.getenv("TRUSTED_PROXY_HOPS", "2")))
    data_dir: str = field(
        default_factory=lambda: os.getenv("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
    )

    @property
    def supabase_enabled(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    def supabase_headers(self) -> dict[str, str]:
        key = self.supabase_service_role_key
        headers = {"apikey": key, "Content-Type": "application/json"}
        if not key.startswith("sb_"):  # legacy JWT keys also go in Authorization; new sb_secret_ keys must not
            headers["Authorization"] = f"Bearer {key}"
        return headers


settings = Settings()

MAX_BODY_BYTES = 8 * 1024
USER_AGENT = "CarMatch/1.0 (https://github.com/guipiacsek/carmatch)"

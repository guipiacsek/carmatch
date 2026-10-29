"""Optional Supabase user identification. A missing or invalid token just means "guest"."""

import asyncio
import logging

import jwt
from fastapi import Request

from .config import settings

log = logging.getLogger(__name__)

_jwks = jwt.PyJWKClient(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json") if settings.supabase_url else None


async def optional_user_id(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    try:
        alg = jwt.get_unverified_header(token).get("alg")
        if alg == "HS256":  # legacy shared JWT secret
            if not settings.supabase_jwt_secret:
                return None
            key: object = settings.supabase_jwt_secret
        elif _jwks:  # asymmetric signing keys (RS256/ES256), published at the project's JWKS endpoint
            key = (await asyncio.to_thread(_jwks.get_signing_key_from_jwt, token)).key
        else:
            return None
        claims = jwt.decode(token, key, algorithms=["HS256", "RS256", "ES256"], audience="authenticated")  # type: ignore[arg-type]
        return str(claims["sub"])
    except (jwt.PyJWTError, KeyError) as e:
        log.info("ignoring invalid bearer token: %s", e)
        return None

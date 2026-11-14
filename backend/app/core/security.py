"""PIN hashing and JWT (SPEC 13: "Auth: PIN + JWT on the API").

Standard library + PyJWT only: no network, no native password library.
"""

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt

from app.core.config import settings

ALGORITHM = "HS256"
_PBKDF2_ITERATIONS = 310_000
_SCHEME = "pbkdf2_sha256"


def hash_pin(pin: str) -> str:
    """PBKDF2-HMAC-SHA256 with a random per-astronaut salt.

    Stored as ``pbkdf2_sha256$<iterations>$<salt hex>$<hash hex>``.
    """
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, _PBKDF2_ITERATIONS)
    return f"{_SCHEME}${_PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_pin(pin: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        scheme, iterations, salt_hex, hash_hex = stored.split("$")
        if scheme != _SCHEME:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", pin.encode(), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(digest.hex(), hash_hex)
    except (ValueError, TypeError):
        return False


# Must match frontend/lib/db/pin.ts (checked by a test).
CLIENT_PIN_ITERATIONS = 150_000


def verify_client_pin(pin: str, hash_b64: str | None, salt_b64: str | None) -> bool:
    """Checks a PIN against the APP's hash format (PBKDF2-SHA256, base64),
    which is what arrives through sync. Lets an astronaut who registered
    on a device sign in to the server with the same PIN."""
    if not hash_b64 or not salt_b64:
        return False
    try:
        salt = base64.b64decode(salt_b64, validate=True)
        expected = base64.b64decode(hash_b64, validate=True)
    except (ValueError, TypeError):
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256", pin.encode(), salt, CLIENT_PIN_ITERATIONS, dklen=len(expected) or 32
    )
    return hmac.compare_digest(digest, expected)


def create_access_token(astronaut_id: UUID, role: str, crew_code: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(astronaut_id),
        "role": role,
        "crew_code": crew_code,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Raises ``jwt.PyJWTError`` if the token is invalid or expired."""
    return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])

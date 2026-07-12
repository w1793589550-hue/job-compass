import base64
import hashlib
import hmac
import json
import secrets
import time


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str, iterations: int = 310_000) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations, 32)
    return f"pbkdf2$sha256${iterations}${_b64encode(salt)}${_b64encode(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, algorithm, rounds, salt, expected = encoded.split("$", 4)
        if scheme != "pbkdf2" or algorithm != "sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            algorithm,
            password.encode(),
            _b64decode(salt),
            int(rounds),
            len(_b64decode(expected)),
        )
        return hmac.compare_digest(digest, _b64decode(expected))
    except (TypeError, ValueError):
        return False


def sign_session(user_id: str, secret: str, ttl_seconds: int = 30 * 24 * 3600) -> str:
    payload = _b64encode(json.dumps({
        "user_id": user_id,
        "expires_at": int(time.time()) + ttl_seconds,
    }, separators=(",", ":")).encode())
    signature = _b64encode(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}"


def read_session(token: str, secret: str) -> str | None:
    try:
        payload, signature = token.split(".", 1)
        expected = _b64encode(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        data = json.loads(_b64decode(payload))
        if int(data["expires_at"]) < int(time.time()):
            return None
        return str(data["user_id"])
    except (AttributeError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


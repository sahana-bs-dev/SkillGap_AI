import time
import random
from app.config import OTP_VALIDITY_SECONDS

_otp_store = {}  # email -> {"code": str, "expires_at": float}

def generate_otp(email: str) -> str:
    code = f"{random.randint(100000, 999999)}"
    _otp_store[email] = {"code": code, "expires_at": time.time() + OTP_VALIDITY_SECONDS}
    return code

def verify_otp(email: str, code: str) -> bool:
    entry = _otp_store.get(email)
    if not entry:
        return False
    if time.time() > entry["expires_at"]:
        del _otp_store[email]
        return False
    return entry["code"] == code

def clear_otp(email: str):
    _otp_store.pop(email, None)
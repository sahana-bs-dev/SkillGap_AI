"""
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/google
GET  /api/auth/me   — protected, proves the JWT -> user lookup chain works
"""

from fastapi import APIRouter, Depends, HTTPException, status
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from app.auth.jwt_handler import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.auth.models import (
    TokenResponse, UserLogin, UserOut, UserSignup,
    ResetPasswordRequest, GoogleLoginRequest,
)
from app.db.mongo_client import users_collection
from app.config import GOOGLE_CLIENT_ID  # see note below

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse)
def signup(payload: UserSignup):
    existing = users_collection.find_one({"email": payload.email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists.",
        )

    user_doc = {
        "name": payload.name,
        "email": payload.email,
        "password": hash_password(payload.password),
    }
    result = users_collection.insert_one(user_doc)
    user_id = str(result.inserted_id)

    token = create_access_token({"sub": user_id})
    return TokenResponse(
        access_token=token,
        user=UserOut(id=user_id, name=payload.name, email=payload.email),
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin):
    user = users_collection.find_one({"email": payload.email})
    if not user or not user.get("password") or not verify_password(payload.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    user_id = str(user["_id"])
    token = create_access_token({"sub": user_id})
    return TokenResponse(
        access_token=token,
        user=UserOut(id=user_id, name=user["name"], email=user["email"]),
    )


@router.post("/google", response_model=TokenResponse)
def google_login(payload: GoogleLoginRequest):
    try:
        idinfo = google_id_token.verify_oauth2_token(
            payload.id_token, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError as e:
        print("Google token verification failed:", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token.",
        )

    email = idinfo["email"]
    name = idinfo.get("name", email.split("@")[0])

    user = users_collection.find_one({"email": email})
    if user:
        # Existing account (email/password or previous Google login) — link by email
        user_id = str(user["_id"])
    else:
        user_doc = {
            "name": name,
            "email": email,
            "password": None,  # no password — Google-only account
            "auth_provider": "google",
        }
        result = users_collection.insert_one(user_doc)
        user_id = str(result.inserted_id)
        name = user_doc["name"]

    token = create_access_token({"sub": user_id})
    return TokenResponse(
        access_token=token,
        user=UserOut(id=user_id, name=name, email=email),
    )


@router.get("/me", response_model=UserOut)
def get_me(current_user: dict = Depends(get_current_user)):
    return UserOut(
        id=str(current_user["_id"]),
        name=current_user["name"],
        email=current_user["email"],
    )
    
@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest):
    user = users_collection.find_one({"email": payload.email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this email.",
        )

    users_collection.update_one(
        {"email": payload.email},
        {"$set": {"password": hash_password(payload.new_password)}},
    )

    return {"message": "Password updated successfully."}
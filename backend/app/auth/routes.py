"""
POST /api/auth/signup
POST /api/auth/login
GET  /api/auth/me   — protected, proves the JWT -> user lookup chain works
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.jwt_handler import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.auth.models import TokenResponse, UserLogin, UserOut, UserSignup
from app.db.mongo_client import users_collection

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
    if not user or not verify_password(payload.password, user["password"]):
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


@router.get("/me", response_model=UserOut)
def get_me(current_user: dict = Depends(get_current_user)):
    return UserOut(
        id=str(current_user["_id"]),
        name=current_user["name"],
        email=current_user["email"],
    )
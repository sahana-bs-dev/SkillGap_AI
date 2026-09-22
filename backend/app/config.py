"""
Central place for all environment variables.
Import from here instead of calling os.getenv() scattered across files —
one source of truth, easy to see everything the app depends on.
"""

import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "skillgap_ai")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-in-your-env-file")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24  # 1 day
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
SENDGRID_FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL")
OTP_VALIDITY_SECONDS = 50
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
YOUTUBE_API_KEY=os.getenv("YOUTUBE_API_KEY")
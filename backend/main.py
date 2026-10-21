import logging
import os
import secrets
from pathlib import Path
from typing import Literal
from urllib.parse import urlencode

import google.auth.exceptions
import requests
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware

from rules_engine import generate_advisory
from services import fetch_soil_data, fetch_weather_data

load_dotenv(Path(__file__).with_name(".env"))

logger = logging.getLogger(__name__)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
SESSION_SECRET = os.getenv("SESSION_SECRET", "development-only-change-this-secret")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000").rstrip("/")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    f"{BACKEND_BASE_URL}/api/auth/google/callback",
)
_GOOGLE_CREDENTIALS_PRESENT = bool(
    GOOGLE_CLIENT_ID
    and GOOGLE_CLIENT_SECRET
    and not GOOGLE_CLIENT_ID.startswith("your-")
    and not GOOGLE_CLIENT_SECRET.startswith("replace-")
)
AUTH_REQUIRED = os.getenv(
    "AUTH_REQUIRED",
    str(_GOOGLE_CREDENTIALS_PRESENT).lower(),
).lower() == "true"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

if SESSION_SECRET == "development-only-change-this-secret" or SESSION_SECRET.startswith("replace-"):
    logger.warning("Using the development session secret; configure SESSION_SECRET before deployment.")
    if ENVIRONMENT == "production":
        raise RuntimeError("Set a unique SESSION_SECRET before starting the backend in production.")

app = FastAPI(title="ArecaSmart Advisory API", version="1.0.0")
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie="arecasmart_session",
    max_age=60 * 60 * 24 * 7,
    same_site="lax",
    https_only=COOKIE_SECURE,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class FarmSubmission(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    growth_stage: Literal[
        "Seedling / Nursery",
        "Juvenile Palm",
        "Pre-Bearing",
        "Bearing",
        "Harvest",
    ]


def google_oauth_configured() -> bool:
    return bool(
        GOOGLE_CLIENT_ID
        and GOOGLE_CLIENT_SECRET
        and not GOOGLE_CLIENT_ID.startswith("your-")
        and not GOOGLE_CLIENT_SECRET.startswith("replace-")
    )


if AUTH_REQUIRED and not google_oauth_configured():
    raise RuntimeError("Set valid Google OAuth credentials before setting AUTH_REQUIRED=true.")
if ENVIRONMENT == "production" and not COOKIE_SECURE:
    raise RuntimeError("Set COOKIE_SECURE=true before starting the backend in production.")
if ENVIRONMENT == "production" and (not AUTH_REQUIRED or not google_oauth_configured()):
    raise RuntimeError("Configure Google OAuth and enable AUTH_REQUIRED before starting in production.")


def require_authenticated_user(request: Request) -> dict | None:
    user = request.session.get("user")
    if AUTH_REQUIRED and not user:
        raise HTTPException(status_code=401, detail="Sign in to analyze farm conditions.")
    return user


def login_redirect(error: str) -> RedirectResponse:
    query = urlencode({"auth_error": error})
    return RedirectResponse(f"{FRONTEND_URL}/login?{query}", status_code=303)


@app.get("/api/health")
def health_check() -> dict:
    return {
        "status": "healthy",
        "message": "Backend and rule engine are active.",
        "google_sign_in_enabled": google_oauth_configured(),
    }


@app.get("/api/auth/me")
def current_user(request: Request) -> dict:
    return {
        "authenticated": bool(request.session.get("user")),
        "user": request.session.get("user"),
        "google_sign_in_enabled": google_oauth_configured(),
        "auth_required": AUTH_REQUIRED,
    }


@app.get("/api/auth/google")
def begin_google_sign_in(request: Request) -> RedirectResponse:
    if not google_oauth_configured():
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )

    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    request.session["oauth_state"] = state
    request.session["oauth_nonce"] = nonce

    query = urlencode(
        {
            "client_id": GOOGLE_CLIENT_ID,
            "redirect_uri": GOOGLE_REDIRECT_URI,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "nonce": nonce,
            "prompt": "select_account",
        }
    )
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{query}")


@app.get("/api/auth/google/callback")
def complete_google_sign_in(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    expected_state = request.session.pop("oauth_state", None)
    expected_nonce = request.session.pop("oauth_nonce", None)
    if error:
        logger.info("Google sign-in was declined or failed: %s", error)
        return login_redirect("Google sign-in was cancelled or could not be completed.")
    if not code or not state or not expected_state or not secrets.compare_digest(state, expected_state):
        return login_redirect("Google sign-in could not be verified. Please try again.")
    if not google_oauth_configured() or not expected_nonce:
        return login_redirect("Google sign-in is not configured on this server.")

    try:
        token_response = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        token_response.raise_for_status()
        tokens = token_response.json()
        claims = id_token.verify_oauth2_token(
            tokens["id_token"],
            GoogleRequest(),
            GOOGLE_CLIENT_ID,
        )
    except (
        KeyError,
        ValueError,
        google.auth.exceptions.GoogleAuthError,
        requests.RequestException,
    ):
        logger.exception("Google OAuth token exchange or validation failed.")
        return login_redirect("Google sign-in could not be verified. Please try again.")

    if claims.get("nonce") != expected_nonce:
        return login_redirect("Google sign-in could not be verified. Please try again.")
    if not claims.get("sub") or not claims.get("email") or claims.get("email_verified") is not True:
        return login_redirect("Google did not return a verified account.")

    request.session.clear()
    request.session["user"] = {
        "id": claims["sub"],
        "email": claims["email"],
        "name": claims.get("name", claims["email"]),
        "picture": claims.get("picture"),
    }
    return RedirectResponse(f"{FRONTEND_URL}/dashboard", status_code=303)


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request) -> Response:
    request.session.clear()
    return Response(status_code=204)


@app.post("/api/analyze", dependencies=[Depends(require_authenticated_user)])
def analyze_farm(
    data: FarmSubmission,
) -> dict:
    try:
        weather = fetch_weather_data(data.latitude, data.longitude)
        soil = fetch_soil_data(data.latitude, data.longitude)
        advisory = generate_advisory(data.growth_stage, weather, soil)
        environmental_metrics = advisory["environmental_metrics"]
        environmental_metrics["weather_source"] = weather["source"]
        environmental_metrics["soil_source"] = soil["source"]

        return {"success": True, "data": advisory}
    except (KeyError, TypeError, ValueError):
        logger.exception("Farm analysis failed while processing environmental data.")
        raise HTTPException(status_code=502, detail="Farm conditions could not be analyzed.") from None

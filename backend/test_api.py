import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlparse

from fastapi import HTTPException
from pydantic import ValidationError
import requests
from starlette.requests import Request

import main
from services import fetch_weather_data


def request_with_session(session: dict) -> Request:
    return Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/auth/google",
            "raw_path": b"/api/auth/google",
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 12345),
            "server": ("localhost", 8000),
            "session": session,
        }
    )


class FarmApiTests(unittest.TestCase):
    def test_health_and_auth_status_are_available_without_oauth_credentials(self) -> None:
        health = main.health_check()
        auth = main.current_user(request_with_session({}))

        self.assertEqual(health["status"], "healthy")
        self.assertIn("google_sign_in_enabled", health)
        self.assertFalse(auth["authenticated"])
        self.assertFalse(auth["google_sign_in_enabled"])

    def test_analysis_response_matches_dashboard_contract(self) -> None:
        weather = {
            "temperature": 27.5,
            "humidity": 72,
            "current_precipitation": 0,
            "forecast_rain_sum": 3.5,
            "source": "live",
        }
        soil = {"ph": 6.2, "clay_content": 25, "source": "fallback"}
        submission = main.FarmSubmission(
            latitude=13.3,
            longitude=75.7,
            growth_stage="Juvenile Palm",
        )

        with (
            patch.object(main, "fetch_weather_data", return_value=weather),
            patch.object(main, "fetch_soil_data", return_value=soil),
        ):
            result = main.analyze_farm(submission)

        data = result["data"]
        self.assertTrue(result["success"])
        self.assertEqual(data["environmental_metrics"]["temperature_c"], 27.5)
        self.assertEqual(data["environmental_metrics"]["relative_humidity_pct"], 72)
        self.assertEqual(data["environmental_metrics"]["weather_source"], "live")
        self.assertEqual(data["environmental_metrics"]["soil_source"], "fallback")
        self.assertIn("fertilization", data["recommendations"])
        self.assertIn("irrigation", data["recommendations"])
        self.assertIn("alert", data["recommendations"])

    def test_analysis_accepts_harvest_and_rejects_unknown_stages(self) -> None:
        submission = main.FarmSubmission(
            latitude=13.3,
            longitude=75.7,
            growth_stage="Harvest",
        )
        self.assertEqual(submission.growth_stage, "Harvest")

        with self.assertRaises(ValidationError):
            main.FarmSubmission(latitude=13.3, longitude=75.7, growth_stage="Unknown")

    def test_google_sign_in_reports_when_credentials_are_placeholders(self) -> None:
        with (
            patch.object(main, "GOOGLE_CLIENT_ID", "your-google-oauth-client-id.apps.googleusercontent.com"),
            patch.object(main, "GOOGLE_CLIENT_SECRET", "replace-with-google-oauth-client-secret"),
        ):
            self.assertFalse(main.google_oauth_configured())

    def test_analysis_auth_requirement_rejects_anonymous_requests(self) -> None:
        with patch.object(main, "AUTH_REQUIRED", True):
            with self.assertRaises(HTTPException) as error:
                main.require_authenticated_user(request_with_session({}))

        self.assertEqual(error.exception.status_code, 401)

    def test_weather_provider_failure_is_labeled_as_fallback(self) -> None:
        with self.assertLogs("services", level="WARNING"):
            with patch("services.requests.get", side_effect=requests.Timeout):
                weather = fetch_weather_data(13.3, 75.7)

        self.assertEqual(weather["source"], "fallback")
        self.assertIn("temperature", weather)

    def test_google_oauth_redirect_uses_state_nonce_and_callback(self) -> None:
        session: dict = {}
        request = request_with_session(session)
        with (
            patch.object(main, "GOOGLE_CLIENT_ID", "test-client-id"),
            patch.object(main, "GOOGLE_CLIENT_SECRET", "test-client-secret"),
        ):
            redirect = main.begin_google_sign_in(request)

        parameters = parse_qs(urlparse(redirect.headers["location"]).query)
        self.assertEqual(parameters["response_type"], ["code"])
        self.assertEqual(parameters["state"], [session["oauth_state"]])
        self.assertEqual(parameters["nonce"], [session["oauth_nonce"]])

        token_response = Mock()
        token_response.json.return_value = {"id_token": "test-id-token"}
        callback_request = request_with_session(session)
        claims = {
            "sub": "google-user-123",
            "email": "farmer@example.com",
            "email_verified": True,
            "name": "Farm Owner",
            "nonce": session["oauth_nonce"],
        }
        with (
            patch.object(main, "GOOGLE_CLIENT_ID", "test-client-id"),
            patch.object(main, "GOOGLE_CLIENT_SECRET", "test-client-secret"),
            patch.object(main.requests, "post", return_value=token_response),
            patch.object(main.id_token, "verify_oauth2_token", return_value=claims),
        ):
            callback = main.complete_google_sign_in(
                callback_request,
                code="test-code",
                state=session["oauth_state"],
            )

        self.assertEqual(callback.status_code, 303)
        self.assertEqual(callback.headers["location"], f"{main.FRONTEND_URL}/dashboard")
        self.assertEqual(session["user"]["email"], "farmer@example.com")
        self.assertNotIn("oauth_state", session)


if __name__ == "__main__":
    unittest.main()

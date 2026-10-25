import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlparse

from fastapi import HTTPException
from pydantic import ValidationError
import requests
from starlette.requests import Request

import main
import services
from services import fetch_soil_data, fetch_weather_data


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
    def test_soil_data_uses_nearby_cache_then_refreshes_after_recovery(self) -> None:
        first_response = Mock()
        first_response.json.return_value = {
            "properties": {
                "layers": [
                    {"name": "phh2o", "depths": [{"values": {"mean": 62}}]},
                    {"name": "clay", "depths": [{"values": {"mean": 250}}]},
                ]
            }
        }
        refreshed_response = Mock()
        refreshed_response.json.return_value = {
            "properties": {
                "layers": [
                    {"name": "phh2o", "depths": [{"values": {"mean": 58}}]},
                    {"name": "clay", "depths": [{"values": {"mean": 310}}]},
                ]
            }
        }

        with (
            patch.object(services, "_soil_cache", None),
            patch(
                "services.requests.get",
                side_effect=[
                    first_response,
                    requests.Timeout,
                    refreshed_response,
                    requests.Timeout,
                ],
            ) as get_soil,
        ):
            first = fetch_soil_data(13.3, 75.7)
            with self.assertLogs("services", level="WARNING"):
                cached = fetch_soil_data(13.3001, 75.7)
            refreshed = fetch_soil_data(13.3, 75.7)
            with self.assertLogs("services", level="WARNING"):
                refreshed_cache = fetch_soil_data(13.3, 75.7)

        self.assertEqual(first, {"ph": 6.2, "clay_content": 25.0, "source": "live"})
        self.assertEqual(cached["source"], "cached")
        self.assertEqual(cached["ph"], first["ph"])
        self.assertEqual(cached["clay_content"], first["clay_content"])
        self.assertGreaterEqual(cached["cache_age_seconds"], 0)
        self.assertTrue(cached["cached_at"].endswith("+00:00"))
        self.assertEqual(refreshed, {"ph": 5.8, "clay_content": 31.0, "source": "live"})
        self.assertEqual(refreshed_cache["source"], "cached")
        self.assertEqual(refreshed_cache["ph"], refreshed["ph"])
        self.assertEqual(get_soil.call_count, 4)

    def test_soil_data_uses_fixed_fallback_when_cache_is_not_nearby(self) -> None:
        response = Mock()
        response.json.return_value = {
            "properties": {
                "layers": [
                    {"name": "phh2o", "depths": [{"values": {"mean": 62}}]},
                    {"name": "clay", "depths": [{"values": {"mean": 250}}]},
                ]
            }
        }

        with (
            patch.object(services, "_soil_cache", None),
            patch(
                "services.requests.get",
                side_effect=[response, requests.Timeout],
            ),
        ):
            fetch_soil_data(13.3, 75.7)
            with self.assertLogs("services", level="WARNING"):
                soil = fetch_soil_data(13.4, 75.7)

        self.assertEqual(
            soil,
            {"ph": 6.0, "clay_content": 28.0, "source": "fallback"},
        )

    def test_analysis_includes_cached_soil_age_and_timestamp(self) -> None:
        weather = {
            "temperature": 27.5,
            "humidity": 72,
            "current_precipitation": 0,
            "forecast_rain_sum": 3.5,
            "source": "live",
        }
        soil = {
            "ph": 6.2,
            "clay_content": 25.0,
            "source": "cached",
            "cached_at": "2026-10-21T10:00:00+00:00",
            "cache_age_seconds": 3600.0,
        }
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

        metrics = result["data"]["environmental_metrics"]
        self.assertEqual(metrics["soil_source"], "cached")
        self.assertEqual(metrics["soil_cached_at"], soil["cached_at"])
        self.assertEqual(metrics["soil_cache_age_seconds"], soil["cache_age_seconds"])

    def test_analysis_marks_refreshed_soil_data_as_live(self) -> None:
        weather = {
            "temperature": 27.5,
            "humidity": 72,
            "current_precipitation": 0,
            "forecast_rain_sum": 3.5,
            "source": "live",
        }
        soil = {"ph": 5.8, "clay_content": 31.0, "source": "live"}
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

        metrics = result["data"]["environmental_metrics"]
        self.assertEqual(metrics["soil_source"], "live")
        self.assertNotIn("soil_cached_at", metrics)
        self.assertNotIn("soil_cache_age_seconds", metrics)

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

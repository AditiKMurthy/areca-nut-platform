import logging
import math
import threading
from dataclasses import dataclass
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)
REQUEST_TIMEOUT_SECONDS = 8
SOIL_CACHE_MAX_DISTANCE_KM = 1.0
EARTH_RADIUS_KM = 6371.0


@dataclass(frozen=True)
class _SoilCacheEntry:
    latitude: float
    longitude: float
    ph: float
    clay_content: float
    fetched_at: datetime


_soil_cache: _SoilCacheEntry | None = None
_soil_cache_lock = threading.Lock()


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1_radians = math.radians(lat1)
    lat2_radians = math.radians(lat2)
    latitude_difference = lat2_radians - lat1_radians
    longitude_difference = math.radians(lon2 - lon1)
    haversine = (
        math.sin(latitude_difference / 2) ** 2
        + math.cos(lat1_radians)
        * math.cos(lat2_radians)
        * math.sin(longitude_difference / 2) ** 2
    )
    return EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(haversine))


def fetch_weather_data(lat: float, lon: float) -> dict:
    """Fetch current weather and average daily forecast rainfall from Open-Meteo."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,precipitation",
        "daily": "precipitation_sum",
        "timezone": "auto",
    }

    try:
        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        data = response.json()
        current = data["current"]
        daily = data["daily"]
        precipitation = daily["precipitation_sum"]
        if not precipitation:
            raise ValueError("Weather response did not include daily precipitation.")

        return {
            "temperature": float(current["temperature_2m"]),
            "humidity": float(current["relative_humidity_2m"]),
            "current_precipitation": float(current["precipitation"]),
            "forecast_rain_sum": sum(float(value) for value in precipitation) / len(precipitation),
            "source": "live",
        }
    except (
        requests.RequestException,
        KeyError,
        TypeError,
        ValueError,
    ):
        logger.warning("Weather provider unavailable; using labeled fallback values.", exc_info=True)
        return {
            "temperature": 29.5,
            "humidity": 82.0,
            "current_precipitation": 0.0,
            "forecast_rain_sum": 2.5,
            "source": "fallback",
        }


def fetch_soil_data(lat: float, lon: float) -> dict:
    """Fetch baseline soil data, caching successful results for nearby locations."""
    global _soil_cache

    url = "https://rest.isric.org/soilgrids/v2.0/properties/query"
    params = {
        "lat": lat,
        "lon": lon,
        "property": ["phh2o", "clay"],
        "depth": "0-5cm",
        "value": "mean",
    }

    try:
        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        layers = response.json()["properties"]["layers"]
        soil_info = {}
        for layer in layers:
            depths = layer.get("depths", [])
            if not depths:
                continue
            mean_value = depths[0].get("values", {}).get("mean")
            if mean_value is None:
                continue
            if layer.get("name") == "phh2o":
                soil_info["ph"] = float(mean_value) / 10.0
            elif layer.get("name") == "clay":
                soil_info["clay_content"] = float(mean_value) / 10.0

        if "ph" not in soil_info or "clay_content" not in soil_info:
            raise ValueError("SoilGrids response did not include both requested properties.")

        fetched_at = datetime.now(timezone.utc)
        with _soil_cache_lock:
            _soil_cache = _SoilCacheEntry(
                latitude=lat,
                longitude=lon,
                ph=soil_info["ph"],
                clay_content=soil_info["clay_content"],
                fetched_at=fetched_at,
            )
        return {**soil_info, "source": "live"}
    except (
        requests.RequestException,
        KeyError,
        TypeError,
        ValueError,
    ):
        with _soil_cache_lock:
            cached_soil = _soil_cache

        if cached_soil is not None and _distance_km(
            lat,
            lon,
            cached_soil.latitude,
            cached_soil.longitude,
        ) <= SOIL_CACHE_MAX_DISTANCE_KM:
            now = datetime.now(timezone.utc)
            cache_age_seconds = max(0.0, (now - cached_soil.fetched_at).total_seconds())
            logger.warning(
                "Soil provider unavailable; using cached data fetched at %s.",
                cached_soil.fetched_at.isoformat(),
                exc_info=True,
            )
            return {
                "ph": cached_soil.ph,
                "clay_content": cached_soil.clay_content,
                "source": "cached",
                "cached_at": cached_soil.fetched_at.isoformat(),
                "cache_age_seconds": cache_age_seconds,
            }

        logger.warning("Soil provider unavailable; using labeled fallback values.", exc_info=True)
        return {"ph": 6.0, "clay_content": 28.0, "source": "fallback"}

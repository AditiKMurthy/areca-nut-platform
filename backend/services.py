import logging

import requests

logger = logging.getLogger(__name__)
REQUEST_TIMEOUT_SECONDS = 8


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
    """Fetch baseline soil pH and clay content from SoilGrids."""
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

        return {**soil_info, "source": "live"}
    except (
        requests.RequestException,
        KeyError,
        TypeError,
        ValueError,
    ):
        logger.warning("Soil provider unavailable; using labeled fallback values.", exc_info=True)
        return {"ph": 6.0, "clay_content": 28.0, "source": "fallback"}

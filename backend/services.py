import requests

def fetch_weather_data(lat: float, lon: float):
    """Fetches live weather and forecast from Open-Meteo API (Free, no key required)."""
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,precipitation&daily=precipitation_sum&timezone=auto"
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            current = data.get("current", {})
            daily = data.get("daily", {})
            return {
                "temperature": current.get("temperature_2m", 28.0),
                "humidity": current.get("relative_humidity_2m", 75.0),
                "current_precipitation": current.get("precipitation", 0.0),
                "forecast_rain_sum": sum(daily.get("precipitation_sum", [0])) / max(len(daily.get("precipitation_sum", [1])), 1)
            }
    except Exception as e:
        print(f"Weather API Error: {e}")
    
    # Fallback default values if offline/timeout
    return {"temperature": 29.5, "humidity": 82.0, "current_precipitation": 0.0, "forecast_rain_sum": 2.5}


def fetch_soil_data(lat: float, lon: float):
    """Fetches baseline soil properties (pH, clay content) from SoilGrids REST API."""
    url = f"https://rest.isric.org/soilgrids/v2.0/properties/query?lat={lat}&lon={lon}&property=phh2o&property=clay&depth=0-5cm&value=mean"
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            layers = response.json().get("properties", {}).get("layers", [])
            soil_info = {}
            for layer in layers:
                name = layer.get("name")
                depths = layer.get("depths", [])
                if depths:
                    mean_val = depths[0].get("values", {}).get("mean", 0)
                    if name == "phh2o":
                        soil_info["ph"] = mean_val / 10.0  # SoilGrids scales pH by 10
                    elif name == "clay":
                        soil_info["clay_content"] = mean_val / 10.0  # g/100g -> %
            return {
                "ph": soil_info.get("ph", 6.2),
                "clay_content": soil_info.get("clay_content", 25.0)
            }
    except Exception as e:
        print(f"SoilGrids API Error: {e}")
        
    # Fallback standard tropical laterite soil defaults for areca belt
    return {"ph": 6.0, "clay_content": 28.0}
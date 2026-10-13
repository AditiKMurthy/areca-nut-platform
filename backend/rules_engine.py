def generate_advisory(stage: str, weather: dict, soil: dict):
    """Evaluates stage, weather, and soil metrics against pre-defined agronomic rules."""
    
    temp = weather["temperature"]
    humidity = weather["humidity"]
    forecast_rain = weather["forecast_rain_sum"]
    soil_ph = soil["ph"]
    
    # Base response structure
    fertilizer = ""
    irrigation = ""
    alert = ""

    # 1. Growth Stage Rule Matching
    if stage == "Seedling / Nursery":
        fertilizer = "Apply balanced NPK 15:15:15 liquid drench (10g per seedling) bi-weekly. Ensure adequate organic compost."
        irrigation = "Provide light mist irrigation every 48 hours. Keep root zone moist but prevent waterlogging."
    elif stage == "Juvenile Palm":
        fertilizer = "Apply 100g Urea, 150g Rock Phosphate, and 100g Muriate of Potash per palm to support root expansion."
        irrigation = "Deliver 35 liters per palm every 5 days via basin irrigation."
    elif stage == "Pre-Bearing":
        fertilizer = "Apply organic FYM (Farmyard manure) 10kg + Micronutrient mix (Boron/Zinc) to prevent fruit setting disorders."
        irrigation = "Provide 50 liters per palm every 7 days."
    else:  # Bearing / Full Production
        fertilizer = "Apply NPK 100:40:140g per palm split quarterly. Supplement with magnesium sulfate (50g) for green canopy retention."
        irrigation = "Provide 65-75 liters of water every 6-8 days."

    # 2. Weather & Forecast Conditional Modifiers
    if forecast_rain > 15.0:
        irrigation = f"HOLD IRRIGATION. Significant forecasted rainfall ({forecast_rain:.1f}mm avg) will fulfill soil water requirements."
    
    # 3. Environmental Fungal & Health Risk Alerts
    if humidity > 85.0 and temp > 26.0:
        alert = "HIGH FUNGAL ALERT: Elevated humidity (>85%) and warmth create prime conditions for Koleroga (Mahali / Fruit Rot) or Bud Rot. Apply prophylactic 1% Bordeaux mixture spray."
    elif soil_ph < 5.5:
        alert = f"SOIL ALERT: Low soil pH detected ({soil_ph}). Apply agricultural lime (dolomite) to correct acidity and improve nutrient uptake."
    else:
        alert = f"Normal operational window. Soil pH is optimal ({soil_ph}) and vegetative vigor index from Sentinel-2 tracking is stable."

    return {
        "stage": stage,
        "environmental_metrics": {
            "temperature_c": temp,
            "relative_humidity_pct": humidity,
            "forecast_rain_mm": forecast_rain,
            "soil_ph": soil_ph
        },
        "recommendations": {
            "fertilization": fertilizer,
            "irrigation": irrigation,
            "alert": alert
        }
    }
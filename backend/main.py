from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from services import fetch_weather_data, fetch_soil_data
from rules_engine import generate_advisory

app = FastAPI(title="ArecaSmart Advisory Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class FarmSubmission(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    growth_stage: str

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "message": "Backend and rule engine are active!"}

@app.post("/api/analyze")
def analyze_farm(data: FarmSubmission):
    try:
        # 1. Fetch live external environmental streams
        weather = fetch_weather_data(data.latitude, data.longitude)
        soil = fetch_soil_data(data.latitude, data.longitude)
        
        # 2. Run through default rule engine
        advisory = generate_advisory(data.growth_stage, weather, soil)
        
        return {
            "success": True,
            "data": advisory
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
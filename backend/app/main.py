import math
from fastapi import FastAPI,HTTPException, Query
import requests
from datetime import datetime
from fastapi.middleware.cors import CORSMiddleware
import joblib
import numpy as np
import pandas as pd
from typing import List
new_data = None
GOOGLE_API_KEY = "AIzaSyDZXOl2w80IeRUOvBlLooNFhbBZf6_0UZ4"


app = FastAPI()



app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # 👈 Say "I trust this frontend"
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Keys (Replace with your actual OpenWeatherMap API key)
OPENWEATHERMAP_API_KEY = "b7bf0702e15026adf3b50f268a82d31d"
@app.get("/")
def read_root():
    return {"status": "ok", "message": "Backend is running!"}

# Function to get weather data from OpenWeatherMap
def get_weather_data(lat: float, lon: float):
    url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={OPENWEATHERMAP_API_KEY}&units=metric"
    
    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()
        # console.log("aditya weather")
        
        

        return {
            "location": data.get("name", "Unknown"),
            #"temperature": data["main"]["temp"],
            #"humidity": data["main"]["humidity"],
            #"wind_speed": data["wind"]["speed"],
        }
    else:
        return {"error": "Failed to fetch weather data"}

# Function to get solar radiation from NASA POWER API
def get_solar_radiation(lat: float, lon: float, date: str):
    url = f"https://power.larc.nasa.gov/api/temporal/hourly/point?latitude={lat}&longitude={lon}&start={date}&end={date}&parameters=ALLSKY_SFC_SW_DWN&community=re&format=json"
    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()
        radiation_data = data["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]

        if not radiation_data:
            return {"error": "No solar radiation data available"}

        radiation_30min_intervals = {}

        for hour in range(9, 20):  # Loop from 9:00 AM (09) to 8:00 PM (20)
            hour_key = f"{date}{hour:02d}"
            next_hour_key = f"{date}{hour+1:02d}"

            # Get radiation values at full hour
            R1 = radiation_data.get(hour_key)
            R2 = radiation_data.get(next_hour_key)

            if R1 is None or R2 is None:
                continue  # Skip if data is missing

            # Store full-hour radiation
            radiation_30min_intervals[f"{hour}:00"] = R1

            # Interpolate for 30-minute interval
            R_half = R1 + (R2 - R1) / 2  # Linear interpolation
            radiation_30min_intervals[f"{hour}:30"] = R_half

        # Add the last value (8:30 PM)
        last_key = f"{date}20"
        if last_key in radiation_data:
            radiation_30min_intervals["20:30"] = radiation_data[last_key]

        return radiation_30min_intervals
    else:
        return {"error": "Failed to fetch solar radiation data"}



# API Endpoint
@app.get("/api/weather")
def get_weather(place: str = Query(...), date: str = Query(...)):
    # Get coordinates from Google Maps Geocoding API
    geocode_url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {
        "address": place,
        "key": GOOGLE_API_KEY
    }
    
    response = requests.get(geocode_url, params=params)

    if response.status_code != 200:
        raise HTTPException(status_code=500, detail="Google Geocoding API error")
    
    data = response.json()
    
    if not data["results"]:
        raise HTTPException(status_code=400, detail="Unable to find location")
    
    location = data["results"][0]["geometry"]["location"]
    lat = location["lat"]
    lon = location["lng"]
    print(f"Coordinates for {place}: lat={lat}, lon={lon}")

    # Get the formatted address from Google Geocoding API
    formatted_address = data["results"][0].get("formatted_address", place)
    
    # Use existing logic
    weather_data = get_weather_data(lat, lon)
    radiation_data = get_solar_radiation(lat, lon, date)

    if "error" in weather_data:
        return {"error": weather_data["error"]}
    if "error" in radiation_data:
        return {"error": radiation_data["error"]}

    return {
        "location": formatted_address,  # Use the formatted address from Google API
        "solar_radiation": radiation_data
    }




model = joblib.load('./ml_model/without_pcm.pkl')

@app.get("/api/without_pcm")
def predict(total_minutes: List[int]=Query(...), solar_radiation: List[float]=Query(...)):
    # Validate input lengths
    if len(total_minutes) != len(solar_radiation):
        raise HTTPException(status_code=400, detail="Input lists must have the same length.")
        
    time_sin = [np.sin(2 * np.pi * t / 1440) for t in total_minutes]
    time_cos = [np.cos(2 * np.pi * t / 1440) for t in total_minutes]
    
    # Prepare the input data for prediction as a 2D NumPy array
    # Each row corresponds to [total_minutes, solar_radiation]
    X = np.array(list(zip(total_minutes, solar_radiation, time_sin, time_cos)))

    
    # Make predictions using the loaded model
    y_pred = model.predict(X)
    
    # Create a list of prediction dictionaries for each input row
    predictions = [
        {"water_temp": float(pred[0]), "box_temp": float(pred[1])} 
        for pred in y_pred
    ]
    
    # Return the predictions as JSON response
    return {"predictions": predictions}



pcm_temp_model=joblib.load('./ml_model/pcm_temp_model.pkl')

@app.get("/api/pcm_temp")
def predict(total_minutes: List[int]=Query(...), solar_radiation: List[float]=Query(...)):
    # Validate input lengths
    if len(total_minutes) != len(solar_radiation):
        raise HTTPException(status_code=400, detail="Input lists must have the same length.")
        

    time_sin = [np.sin(2 * np.pi * t / 1440) for t in total_minutes]
    time_cos = [np.cos(2 * np.pi * t / 1440) for t in total_minutes]

    # Phase 1: Predict PCM temperature
    X_pcm = np.array(list(zip(total_minutes, solar_radiation,time_sin, time_cos)))

    y_pred = pcm_temp_model.predict(X_pcm)

    predictions = y_pred.tolist()

    return {
        "predictions": predictions
    }



final_model=joblib.load('./ml_model/with_pcm_model.pkl')

@app.get("/api/with_pcm")
def predict(total_minutes: List[int]=Query(...), solar_radiation: List[float]=Query(...)):
    # Validate input lengths
    if len(total_minutes) != len(solar_radiation):
        raise HTTPException(status_code=400, detail="Input lists must have the same length.")
        

    time_sin = [np.sin(2 * np.pi * t / 1440) for t in total_minutes]
    time_cos = [np.cos(2 * np.pi * t / 1440) for t in total_minutes]


    # Phase 1: Predict PCM temperature
    X_pcm = np.array(list(zip(total_minutes, solar_radiation,time_sin, time_cos)))    
    predicted_pcm_temp = pcm_temp_model.predict(X_pcm)



    # Phase 2: Predict final temperatures using predicted PCM temp
    X_final = np.column_stack((total_minutes, solar_radiation,time_sin, time_cos, predicted_pcm_temp))
    y_pred = final_model.predict(X_final)
    
     # Format the predictions

    predictions = []
    for i in range(len(y_pred)):
        predictions.append({
            "water_temp": float(y_pred[i][0]),
            "box_temp": float(y_pred[i][1])
        })
    new_data = pd.DataFrame(predictions)
    print(new_data)
    return {
        "predictions": predictions
    }



tps_model=joblib.load('./ml_model/tps_temp_model.pkl')

@app.get("/api/eval")
def predict(avg_radiation: float, Tw2_with_pcm: float, Tw2_without_pcm:float):
    #Defining constant variables
    Cw = 4186 # Specific Heat Capacity of Water
    Ap = 0.2704 #Area of Plate in Metre Sq.
    Mw = 1 # Mass of water in Kg
    Mp = 0.322 #Mass of Pot in Kg
    Cp = 900 #Specific Heat capacity of Pot
    Ta = 32 #ambient temperature (Ta)
    Tw1 = 25

    #F1
    Tps = tps_model.predict([[avg_radiation]])[0]  #max plat temp
    Gt = avg_radiation #avg solar radiation
    F1 = (Tps - Ta)/Gt
    

    #F2_without_PCM
    t = 41400 #duration in seconds from 9:00 to 20:30
    C1 = (Mw*Ap*Cw)/t
    N= 1 - ((1/F1)*(Tw1-Ta))/Gt
    D =1 - ((1/F1)*(Tw2_without_pcm-Ta))/Gt
    if N>0 and D>0:
        C2 = np.log(N/D)
    else:
        C2=1
    F2_without_pcm = F1*C1*C2


    #F2_with_PCM
    t = 41400 #duration in seconds from 9:00 to 20:30
    C1 = (Mw*Ap*Cw)/t
    N= 1 - ((1/F1)*(Tw1-Ta))/Gt
    D =1 - ((1/F1)*(Tw2_with_pcm-Ta))/Gt
    if N>0 and D>0:
        C2 = np.log(N/D)
    else:
        C2=1
    F2_with_pcm = F1*C1*C2

    #efficiency without pcm
    dT = Tw2_without_pcm-Tw1 #change in box temp
    eff_without_pcm = (Mp*Cp*dT+Mw*Cw*dT)/(Gt*t*Ap)


    #efficiency with pcm
    dT = Tw2_with_pcm-Tw1 #change in box temp
    eff_with_pcm = (Mp*Cp*dT+Mw*Cw*dT)/(Gt*t*Ap)

    return {
    "F1": float(F1) if math.isfinite(F1) else None,
    "F2_without_pcm": float(F2_without_pcm) if math.isfinite(F2_without_pcm) else None,
    "F2_with_pcm": float(F2_with_pcm) if math.isfinite(F2_with_pcm) else None,
    "eff_without_pcm": float(eff_without_pcm) if math.isfinite(eff_without_pcm) else None,
    "eff_with_pcm": float(eff_with_pcm) if math.isfinite(eff_with_pcm) else None
}

    
   



rice_room_model=joblib.load('./ml_model/rice_room_model.pkl')
@app.get("/api/rice_room")
def predict_cooking_time(time: List[str] = Query(...),water_temp: List[float] = Query(...),box_temp: List[float] = Query(...)):

    # Predict cooking time
    box_water_temp = pd.DataFrame({
        'water_temp': water_temp,
        'box_temp': box_temp
    })
    time_taken = rice_room_model.predict(box_water_temp)

    # Format output
    predictions = [
        {"time": time[i], "cooking_time": float(time_taken[i])}
        for i in range(len(time))
    ]

    return {"predictions": predictions}



sambar_room_model=joblib.load('./ml_model/sambar_room_model.pkl')
@app.get("/api/sambar_room")
def predict_cooking_time(time: List[str] = Query(...),water_temp: List[float] = Query(...),box_temp: List[float] = Query(...)):

    # Predict cooking time
    box_water_temp = pd.DataFrame({
        'water_temp': water_temp,
        'box_temp': box_temp
    })
    time_taken = sambar_room_model.predict(box_water_temp)

    # Format output
    predictions = [
        {"time": time[i], "cooking_time": float(time_taken[i])}
        for i in range(len(time))
    ]

    return {"predictions": predictions}


rice_peak_model=joblib.load('./ml_model/rice_peak_model.pkl')
@app.get("/api/rice_peak")
def predict_cooking_time(time: List[str] = Query(...),water_temp: List[float] = Query(...),box_temp: List[float] = Query(...)):

    # Predict cooking time
    box_water_temp = pd.DataFrame({
        'water_temp': water_temp,
        'box_temp': box_temp
    })
    time_taken = rice_peak_model.predict(box_water_temp)

    # Format output
    predictions = [
        {"time": time[i], "cooking_time": float(time_taken[i])}
        for i in range(len(time))
    ]

    return {"predictions": predictions}


sambar_peak_model=joblib.load('./ml_model/sambar_peak_model.pkl')
@app.get("/api/sambar_peak")
def predict_cooking_time(time: List[str] = Query(...),water_temp: List[float] = Query(...),box_temp: List[float] = Query(...)):

    # Predict cooking time
    box_water_temp = pd.DataFrame({
        'water_temp': water_temp,
        'box_temp': box_temp
    })
    time_taken = sambar_peak_model.predict(box_water_temp)

    # Format output
    predictions = [
        {"time": time[i], "cooking_time": float(time_taken[i])}
        for i in range(len(time))
    ]

    return {"predictions": predictions}

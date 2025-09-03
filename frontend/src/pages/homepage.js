import React, { useState, useEffect, useRef } from "react";
import axios from 'axios';
import "../styles/homepage.css";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

function HomePage() {
    const [latitude, setLatitude] = useState("");
    const [longitude, setLongitude] = useState("");
    const [place, setPlace] = useState("");
    const [date, setDate] = useState("");
    const [loading, setLoading] = useState(false);
    const [radiation_result, setRadiationResult] = useState(null);
    const [error, setError] = useState(null);
    const [withoutPcmResults, setWithoutPcmResults] = useState([]);
    const [withPcmResults, setWithPcmResults] = useState([]);
    const [pcmTempPredictions, setPcmTempResults] = useState([]);
    const [eval_check, setEvalCheck] = useState(false);
    const [eval_result, setEvalResult] = useState([]);
    const [rice_room, setRiceRoom] = useState([]);
    const [sambar_room, setSambarRoom] = useState([]);
    const [rice_peak, setRicePeak] = useState([]);
    const [sambar_peak, setSambarPeak] = useState([]);
    const autocompleteRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        const loadGoogleMapsAPI = () => {
            // Check if already loaded
            if (window.google && window.google.maps && window.google.maps.places) {
                initializeAutocomplete();
                return;
            }

            // Check if script is already being loaded
            if (document.querySelector('script[src*="maps.googleapis.com"]')) {
                // Wait for existing script to load
                const checkGoogleLoaded = setInterval(() => {
                    if (window.google && window.google.maps && window.google.maps.places) {
                        clearInterval(checkGoogleLoaded);
                        initializeAutocomplete();
                    }
                }, 100);
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyDZXOl2w80IeRUOvBlLooNFhbBZf6_0UZ4&libraries=places';
            script.async = true;
            script.defer = true;
            script.onload = () => {
                console.log('Google Maps API loaded successfully');
                initializeAutocomplete();
            };
            script.onerror = () => {
                console.error('Failed to load Google Maps API');
                setError("Failed to load location autocomplete. You can still type manually.");
            };
            document.head.appendChild(script);
        };

        loadGoogleMapsAPI();
    }, []);

    const initializeAutocomplete = () => {
        if (!inputRef.current) {
            console.error('Input ref not available');
            return;
        }
        
        if (!window.google || !window.google.maps || !window.google.maps.places) {
            console.error('Google Maps Places API not available');
            return;
        }

        try {
            autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
                types: ['(cities)'],
                fields: ['formatted_address', 'geometry', 'name'],
                componentRestrictions: { country: 'IN' }, // Restrict to India for better results
            });

            autocompleteRef.current.addListener('place_changed', () => {
                const place = autocompleteRef.current.getPlace();
                console.log('Place selected:', place);
                
                if (place.geometry) {
                    setPlace(place.formatted_address || place.name);
                    setLatitude(place.geometry.location.lat());
                    setLongitude(place.geometry.location.lng());
                    console.log('Location set:', place.formatted_address);
                } else {
                    console.warn('No geometry found for selected place');
                }
            });

            console.log('Autocomplete initialized successfully');
        } catch (error) {
            console.error('Error initializing autocomplete:', error);
            setError("Location autocomplete failed to initialize. You can still type manually.");
        }
    };

    const getradiation = async () => {
        console.log("Aditya Server started");
        if (!place.trim()) {
            setError("Please enter a location");
            return;
        }
        if (!date) {
            setError("Please select a date");
            return;
        }
        
        setLoading(true);
        setError(null);
        try {
            const formattedDate = date.replace(/-/g, '');
            console.log('Fetching radiation data for:', place, 'on', formattedDate);
            
            const response = await axios.get('https://solar-cooker-performance-prediction.onrender.com/api/weather', {
                params: { place: place, date: formattedDate }
            });
            const data = response.data;
            
            if (response.status === 200 && data.solar_radiation) {
                console.log('Radiation data received:', data);
                setRadiationResult(data);
                setError(null);
            } else {
                setError(data.error || "Failed to fetch solar radiation data");
            }
        } catch (error) {
            console.error("Error fetching radiation data:", error);
            if (error.response) {
                setError(`Server error: ${error.response.data?.detail || error.response.statusText}`);
            } else if (error.request) {
                setError("Network error: Unable to connect to server. Please check your internet connection.");
            } else {
                setError("Failed to fetch solar radiation data");
            }
        } finally {
            setLoading(false);
        }
    };

    // Manual input handler for location
    const handleLocationChange = (e) => {
        setPlace(e.target.value);
        setError(null); // Clear any previous errors
    };

    async function get_without_pcm() {
        if (!radiation_result || !radiation_result.solar_radiation) {
            setError("No radiation data available");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const solarEntries = Object.entries(radiation_result.solar_radiation);
            const solar_radiation = solarEntries.map(([_, val]) => val);
            const timeLabels = solarEntries.map(([time, _]) => time);
            const total_minutes = timeLabels.map((time) => {
                const [hours, minutes] = time.split(":").map(Number);
                return hours * 60 + minutes;
            });
            
            const queryParams = new URLSearchParams();
            total_minutes.forEach((min) => queryParams.append("total_minutes", min));
            solar_radiation.forEach((sr) => queryParams.append("solar_radiation", sr));
            console.log("here radiation", queryParams);

            console.log(queryParams.toString());

            
            const response = await fetch(`https://solar-cooker-performance-prediction.onrender.com/api/without_pcm?${queryParams.toString()}`);
            const data = await response.json();
            
            if (response.ok) {
                const predictionsWithTime = data.predictions.map((pred, index) => ({
                    time: timeLabels[index],
                    water_temp: parseFloat(pred.water_temp.toFixed(2)),
                    box_temp: parseFloat(pred.box_temp.toFixed(2))
                }));
                setWithoutPcmResults(predictionsWithTime);
            } else {
                setError(data.error || "Failed to predict data");
            }
        } catch (error) {
            console.error("Error predicting without PCM:", error);
            setError("Error predicting data");
        } finally {
            setLoading(false);
        }
    }

    async function get_pcm_temp() {
        if (!radiation_result || !radiation_result.solar_radiation) {
            setError("No radiation data available");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const solarEntries = Object.entries(radiation_result.solar_radiation);
            const solar_radiation = solarEntries.map(([_, val]) => val);
            const timeLabels = solarEntries.map(([time, _]) => time);
            const total_minutes = timeLabels.map((time) => {
                const [hours, minutes] = time.split(":").map(Number);
                return hours * 60 + minutes;
            });
            
            const queryParams = new URLSearchParams();
            total_minutes.forEach((min) => queryParams.append("total_minutes", min));
            solar_radiation.forEach((sr) => queryParams.append("solar_radiation", sr));
            
            const response = await fetch(`https://solar-cooker-performance-prediction.onrender.com/api/pcm_temp?${queryParams.toString()}`);
            const data = await response.json();
            
            if (response.ok) {
                const pcmTempPredictions = data.predictions.map((temp, index) => ({
                    time: timeLabels[index],
                    pcm_temp: parseFloat(temp.toFixed(2))
                }));
                setPcmTempResults(pcmTempPredictions);
            } else {
                setError(data.error || "Failed to predict data");
            }
        } catch (error) {
            console.error("Error predicting PCM temp:", error);
            setError("Error predicting data");
        } finally {
            setLoading(false);
        }
    }

    async function get_with_pcm() {
        if (!radiation_result || !radiation_result.solar_radiation) {
            setError("No radiation data available");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const solarEntries = Object.entries(radiation_result.solar_radiation);
            const solar_radiation = solarEntries.map(([_, val]) => val);
            const timeLabels = solarEntries.map(([time, _]) => time);
            const total_minutes = timeLabels.map((time) => {
                const [hours, minutes] = time.split(":").map(Number);
                return hours * 60 + minutes;
            });
            
            const queryParams = new URLSearchParams();
            total_minutes.forEach((min) => queryParams.append("total_minutes", min));
            solar_radiation.forEach((sr) => queryParams.append("solar_radiation", sr));
            
            const response = await fetch(`https://solar-cooker-performance-prediction.onrender.com/api/with_pcm?${queryParams.toString()}`);
            const data = await response.json();
            
            if (response.ok) {
                const predictionsWithTime = data.predictions.map((pred, index) => ({
                    time: timeLabels[index],
                    water_temp: parseFloat(pred.water_temp.toFixed(2)),
                    box_temp: parseFloat(pred.box_temp.toFixed(2))
                }));
                setWithPcmResults(predictionsWithTime);
            } else {
                setError(data.error || "Failed to predict data");
            }
        } catch (error) {
            console.error("Error predicting with PCM:", error);
            setError("Error predicting data");
        } finally {
            setLoading(false);
        }
    }

    async function get_eval() {
        if (!radiation_result || !radiation_result.solar_radiation) {
            setError("No radiation data available");
            return;
        }
        if (withoutPcmResults.length === 0 || withPcmResults.length === 0) {
            setError("Please run both 'Without PCM' and 'With PCM' predictions first");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            let total = 0;
            let count = 0;
            for (const value of Object.values(radiation_result.solar_radiation)) {
                total += value;
                count++;
            }
            const avg_radiation = total / count;
            
            let maxWithoutPCM = 0;
            let maxWithPCM = 0;
            
            for (const obj of withoutPcmResults) {
                if (obj.water_temp > maxWithoutPCM) {
                    maxWithoutPCM = obj.water_temp;
                }
            }
            
            for (const obj of withPcmResults) {
                if (obj.water_temp > maxWithPCM) {
                    maxWithPCM = obj.water_temp;
                }
            }
            
            const response = await fetch(`https://solar-cooker-performance-prediction.onrender.com/api/eval?avg_radiation=${avg_radiation}&Tw2_with_pcm=${maxWithPCM}&Tw2_without_pcm=${maxWithoutPCM}`);
            const data = await response.json();
            
            if (response.ok) {
                setEvalResult(data); 
                setEvalCheck(true);
            } else {
                setError(data.error || "Failed to fetch evaluation results");
            }
        } catch (error) {
            console.error("Error calling evaluation API:", error);
            setError("Failed to fetch evaluation results");
        } finally {
            setLoading(false);
        }
    }

    async function get_rice_room() { 
        if (!withPcmResults || withPcmResults.length === 0) {
            setError("Please run 'With PCM' prediction first to get cooking time data");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const queryParams = new URLSearchParams();
            withPcmResults.forEach(entry => {
                queryParams.append("time", entry.time);
                queryParams.append("water_temp", entry.water_temp);
                queryParams.append("box_temp", entry.box_temp);
            });    
            const response = await fetch(`https://solar-cooker-performance-prediction.onrender.com/api/rice_room?${queryParams.toString()}`);
            const data = await response.json();
            
            if (response.ok) {
                const rice_room = data.predictions.map((pred, index) => ({
                    time: pred.time,
                    cooking_time: parseFloat(pred.cooking_time.toFixed(2))
                }));
                setRiceRoom(rice_room);
            } else {
                setError(data.error || "Failed to predict data");
            }
        } catch (error) {
            console.error("Error predicting rice room temp:", error);
            setError("Error predicting data");   
        } finally {
            setLoading(false);
        }
    }

    async function get_sambar_room() { 
        if (!withPcmResults || withPcmResults.length === 0) {
            setError("Please run 'With PCM' prediction first to get cooking time data");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const queryParams = new URLSearchParams();
            withPcmResults.forEach(entry => {
                queryParams.append("time", entry.time);
                queryParams.append("water_temp", entry.water_temp);
                queryParams.append("box_temp", entry.box_temp);
            });    
            const response = await fetch(`https://solar-cooker-performance-prediction.onrender.com/api/sambar_room?${queryParams.toString()}`);
            const data = await response.json();
            
            if (response.ok) {
                const sambar_room = data.predictions.map((pred, index) => ({
                    time: pred.time,
                    cooking_time: parseFloat(pred.cooking_time.toFixed(2))
                }));
                setSambarRoom(sambar_room);
            } else {
                setError(data.error || "Failed to predict data");
            }
        } catch (error) {
            console.error("Error predicting sambar room temp:", error);
            setError("Error predicting data");   
        } finally {
            setLoading(false);
        }
    }

    async function get_rice_peak() { 
        if (!withPcmResults || withPcmResults.length === 0) {
            setError("Please run 'With PCM' prediction first to get cooking time data");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const queryParams = new URLSearchParams();
            withPcmResults.forEach(entry => {
                queryParams.append("time", entry.time);
                queryParams.append("water_temp", entry.water_temp);
                queryParams.append("box_temp", entry.box_temp);
            });    
            const response = await fetch(`https://solar-cooker-performance-prediction.onrender.com/api/rice_peak?${queryParams.toString()}`);
            const data = await response.json();
            
            if (response.ok) {
                const rice_peak = data.predictions.map((pred, index) => ({
                    time: pred.time,
                    cooking_time: parseFloat(pred.cooking_time.toFixed(2))
                }));
                setRicePeak(rice_peak);
            } else {
                setError(data.error || "Failed to predict data");
            }
        } catch (error) {
            console.error("Error predicting rice peak temp:", error);
            setError("Error predicting data");   
        } finally {
            setLoading(false);
        }
    }

    async function get_sambar_peak() { 
        if (!withPcmResults || withPcmResults.length === 0) {
            setError("Please run 'With PCM' prediction first to get cooking time data");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const queryParams = new URLSearchParams();
            withPcmResults.forEach(entry => {
                queryParams.append("time", entry.time);
                queryParams.append("water_temp", entry.water_temp);
                queryParams.append("box_temp", entry.box_temp);
            });    
            const response = await fetch(`https://solar-cooker-performance-prediction.onrender.com/api/sambar_peak?${queryParams.toString()}`);
            const data = await response.json();
            
            if (response.ok) {
                const sambar_peak = data.predictions.map((pred, index) => ({
                    time: pred.time,
                    cooking_time: parseFloat(pred.cooking_time.toFixed(2))
                }));
                setSambarPeak(sambar_peak);
            } else {
                setError(data.error || "Failed to predict data");
            }
        } catch (error) {
            console.error("Error predicting sambar peak temp:", error);
            setError("Error predicting data");   
        } finally {
            setLoading(false);
        }
    }
    
    const chartData = radiation_result?.solar_radiation
        ? Object.entries(radiation_result.solar_radiation).map(([time, value]) => ({
            time,
            radiation: Number(parseFloat(value).toFixed(2)), 
        })) : [];

    return (
        <div className="homepage">
            {/* Hero Section */}
            <section className="hero-section">
                <div className="hero-content">
                    <div className="hero-icons">
                        <span role="img" aria-label="sun">☀️</span>
                        <span role="img" aria-label="leaf">🌱</span>
                        <span role="img" aria-label="bolt">⚡</span>
                    </div>
                    <h1 className="hero-title">Solar Cooker Performance Predictor</h1>
                    <p className="hero-subtitle">
                        Harness the power of sustainable cooking with AI-driven predictions for solar cooker efficiency. Compare performance with and without Phase Change Materials (PCM) for optimal cooking results.
                    </p>
                    <div className="hero-decoration-1"></div>
                    <div className="hero-decoration-2"></div>
                </div>
            </section>

            <main className="main-container">
                {/* Location & Date Selection */}
                <div className="card">
                    <div className="card-header">
                        <span role="img" aria-label="location">📍</span>
                        <span className="card-title">Location & Date Selection</span>
                    </div>
                    <div className="input-group">
                        <label className="input-label" htmlFor="location-input">
                            <span role="img" aria-label="city">🏙️</span> Location
                        </label>
                        <input
                            ref={inputRef}
                            id="location-input"
                            type="text"
                            className="input-field"
                            placeholder="Enter city (e.g., Chennai, Mumbai)"
                            value={place}
                            onChange={handleLocationChange}
                        />
                        <label className="input-label" htmlFor="date-input">
                            <span role="img" aria-label="calendar">📅</span> Date
                        </label>
                        <input
                            id="date-input"
                            type="date"
                            className="input-field"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                        />
                        <button className="btn-primary" onClick={getradiation} disabled={loading}>
                            {loading ? <span className="spinner"></span> : <><span role="img" aria-label="sun">☀️</span> Get Solar Radiation Data</>}
                        </button>
                        
                        {/* Error Display */}
                        {error && (
                            <div style={{
                                backgroundColor: '#fef2f2',
                                border: '1px solid #fecaca',
                                borderRadius: '8px',
                                padding: '12px',
                                marginTop: '12px',
                                color: '#dc2626',
                                fontSize: '14px'
                            }}>
                                <span role="img" aria-label="warning">⚠️</span> {error}
                            </div>
                        )}
                        
                        {/* Success Message */}
                        {radiation_result && !error && (
                            <div style={{
                                backgroundColor: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                borderRadius: '8px',
                                padding: '12px',
                                marginTop: '12px',
                                color: '#15803d',
                                fontSize: '14px'
                            }}>
                                <span role="img" aria-label="success">✅</span> Solar radiation data loaded for {radiation_result.location}
                            </div>
                        )}
                        
                        {/* Solar Radiation Chart */}
                        {radiation_result && radiation_result.solar_radiation && (
                            <div className="chart-container">
                                <div className="chart-title">
                                    <span role="img" aria-label="sun">☀️</span> Solar Radiation Intensity Over Time
                                </div>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#fbbf24" strokeOpacity={0.1} />
                                        <XAxis dataKey="time" stroke="#92400e" strokeOpacity={0.3} />
                                        <YAxis domain={[0, "auto"]} stroke="#92400e" strokeOpacity={0.3} />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: "#fbbf24", color: "#92400e", borderRadius: "10px", border: "none" }}
                                            itemStyle={{ color: "#92400e" }}
                                            formatter={(value, name) => [`${value} W/m²`, "Solar Radiation"]}
                                            labelFormatter={(label) => `Time: ${label}`}
                                        />
                                        <Legend verticalAlign="top" wrapperStyle={{ color: "#92400e", fontSize: "16px", paddingBottom: "20px" }} />
                                        <Line 
                                            type="monotone" 
                                            dataKey="radiation" 
                                            name="Solar Radiation" 
                                            stroke="#f59e0b" 
                                            strokeWidth={3} 
                                            strokeOpacity={0.7} 
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>

                {/* Prediction Cards Grid */}
                <div className="prediction-grid">
                    {/* Without PCM Card */}
                    <div className="prediction-card">
                        <div className="prediction-card-header">
                            <span role="img" aria-label="flame">🔥</span>
                            <span className="prediction-card-title">Performance without PCM</span>
                            <span className="status-pill active">Active</span>
                        </div>

                        <div className="prediction-card-button">
                            <button className="btn-secondary" onClick={get_without_pcm} disabled={loading}>
                                {loading ? <span className="spinner"></span> : <><span role="img" aria-label="chart">📊</span> Predict Performance</>}
                            </button>
                        </div>
                        {withoutPcmResults.length > 0 && (
                            <div className="chart-container">
                                <ResponsiveContainer width="100%" height={200}>
                                    <LineChart data={withoutPcmResults}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#fbbf24" strokeOpacity={0.1} />
                                        <XAxis dataKey="time" stroke="#92400e" strokeOpacity={0.3} />
                                        <YAxis domain={[0, "auto"]} stroke="#92400e" strokeOpacity={0.3} />
                                        <Tooltip contentStyle={{ backgroundColor: "#fbbf24", color: "#92400e", borderRadius: "10px", border: "none" }}
                                            itemStyle={{ color: "#92400e" }}
                                            formatter={(value, name) => [`${value} °C`, name === "Water Temp" ? "Water Temp" : "Box Temp"]}
                                            labelFormatter={(label) => `Time: ${label}`}
                                        />
                                        <Legend verticalAlign="top" wrapperStyle={{ color: "#92400e", fontSize: "12px", paddingBottom: "10px" }} />
                                        <Line type="monotone" dataKey="water_temp" name="Water Temp" stroke="#16a34a" strokeWidth={2} strokeOpacity={0.7} />
                                        <Line type="monotone" dataKey="box_temp" name="Box Temp" stroke="#fbbf24" strokeWidth={2} strokeOpacity={0.7} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* With PCM Card */}
                    <div className="prediction-card">
                        <div className="prediction-card-header">
                            <span role="img" aria-label="bolt">⚡</span>
                            <span className="prediction-card-title">Performance with PCM</span>
                            <span className="status-pill active">Active</span>
                        </div>

                        <div className="prediction-card-button">
                            <button className="btn-pcm btn-secondary" onClick={get_with_pcm} disabled={loading}>
                                {loading ? <span className="spinner"></span> : <><span role="img" aria-label="chart">📊</span> Predict Performance</>}
                            </button>
                        </div>
                        {withPcmResults.length > 0 && (
                            <div className="chart-container">
                                <ResponsiveContainer width="100%" height={200}>
                                    <LineChart data={withPcmResults}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#22c55e" strokeOpacity={0.1} />
                                        <XAxis dataKey="time" stroke="#15803d" strokeOpacity={0.3} />
                                        <YAxis domain={[0, "auto"]} stroke="#15803d" strokeOpacity={0.3} />
                                        <Tooltip contentStyle={{ backgroundColor: "#bbf7d0", color: "#15803d", borderRadius: "10px", border: "none" }}
                                            itemStyle={{ color: "#15803d" }}
                                            formatter={(value, name) => [`${value} °C`, name === "Water Temp" ? "Water Temp" : "Box Temp"]}
                                            labelFormatter={(label) => `Time: ${label}`}
                                        />
                                        <Legend verticalAlign="top" wrapperStyle={{ color: "#15803d", fontSize: "12px", paddingBottom: "10px" }} />
                                        <Line type="monotone" dataKey="water_temp" name="Water Temp" stroke="#059669" strokeWidth={2} strokeOpacity={0.7} />
                                        <Line type="monotone" dataKey="box_temp" name="Box Temp" stroke="#fbbf24" strokeWidth={2} strokeOpacity={0.7} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* PCM Temperature Prediction Card */}
                    <div className="prediction-card">
                        <div className="prediction-card-header">
                            <span role="img" aria-label="bolt">⚡</span>
                            <span className="prediction-card-title">PCM Temperature Prediction</span>
                            <span className="status-pill active">Active</span>
                        </div>

                        <div className="prediction-card-button">
                            <button className="btn-pcm btn-secondary" onClick={get_pcm_temp} disabled={loading}>
                                {loading ? <span className="spinner"></span> : <><span role="img" aria-label="chart">📊</span> Predict PCM Temperature</>}
                            </button>
                        </div>
                        {pcmTempPredictions.length > 0 && (
                            <div className="chart-container">
                                <ResponsiveContainer width="100%" height={200}>
                                    <LineChart data={pcmTempPredictions}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#22c55e" strokeOpacity={0.1} />
                                        <XAxis dataKey="time" stroke="#15803d" strokeOpacity={0.3} />
                                        <YAxis domain={[0, "auto"]} stroke="#15803d" strokeOpacity={0.3} />
                                        <Tooltip contentStyle={{ backgroundColor: "#bbf7d0", color: "#15803d", borderRadius: "10px", border: "none" }}
                                            itemStyle={{ color: "#15803d" }}
                                            formatter={(value, name) => [`${value} °C`, name === "PCM Temp" ? "PCM Temp" : "Unknown"]}
                                            labelFormatter={(label) => `Time: ${label}`}
                                        />
                                        <Legend verticalAlign="top" wrapperStyle={{ color: "#15803d", fontSize: "12px", paddingBottom: "10px" }} />
                                        <Line type="monotone" dataKey="pcm_temp" name="PCM Temp" stroke="#22c55e" strokeWidth={3} strokeOpacity={0.7} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* Performance Evaluation Card */}
                    <div className="prediction-card">
                        <div className="prediction-card-header">
                            <span role="img" aria-label="chart">📈</span>
                            <span className="prediction-card-title">Performance Evaluation</span>
                            <span className="status-pill active">Active</span>
                        </div>

                        <div className="prediction-card-button">
                            <button className="btn-eval btn-secondary" onClick={get_eval} disabled={loading}>
                                {loading ? <span className="spinner"></span> : <><span role="img" aria-label="document">📄</span> Complete Evaluation</>}
                            </button>
                        </div>
                        {eval_check && (
                            <div className="eval-grid">
                                <div className="eval-card without-pcm">
                                    <div className="eval-title without-pcm"><span role="img" aria-label="thermometer">🌡️</span> Without PCM</div>
                                    <div className="eval-metrics">
                                        <div className="eval-metric"><span className="eval-metric-label">F1:</span> <span className="eval-metric-value without-pcm">{eval_result.F1.toFixed(5)}</span></div>
                                        <div className="eval-metric"><span className="eval-metric-label">F2:</span> <span className="eval-metric-value without-pcm">{eval_result.F2_without_pcm.toFixed(5)}</span></div>
                                        <div className="eval-metric"><span className="eval-metric-label">Efficiency:</span> <span className="eval-metric-value without-pcm">{eval_result.eff_without_pcm.toFixed(5)}</span></div>
                                    </div>
                                </div>
                                <div className="eval-card with-pcm">
                                    <div className="eval-title with-pcm"><span role="img" aria-label="leaf">🌿</span> With PCM</div>
                                    <div className="eval-metrics">
                                        <div className="eval-metric"><span className="eval-metric-label">F1:</span> <span className="eval-metric-value with-pcm">{eval_result.F1.toFixed(5)}</span></div>
                                        <div className="eval-metric"><span className="eval-metric-label">F2:</span> <span className="eval-metric-value with-pcm">{eval_result.F2_with_pcm.toFixed(5)}</span></div>
                                        <div className="eval-metric"><span className="eval-metric-label">Efficiency:</span> <span className="eval-metric-value with-pcm">{eval_result.eff_with_pcm.toFixed(5)}</span></div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Cooking Time Section */}
                <div className="cooking-grid">
                    <div className="prediction-card">
                        <div className="prediction-card-header">
                            <span role="img" aria-label="rice">🍚</span>
                            <span className="prediction-card-title">1/2 kg Rice Cooking Time at Room Temp</span>
                            <span className="status-pill active">Active</span>
                        </div>
                        <div className="prediction-card-button">
                            <button className="btn-secondary" onClick={get_rice_room} disabled={loading}>
                                {loading ? <span className="spinner"></span> : "Predict"}
                            </button>
                        </div>
                        {rice_room.length > 0 ? (
                            <div className="chart-container">
                                <ResponsiveContainer width="100%" height={200}>
                                    <LineChart data={rice_room}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#fbbf24" strokeOpacity={0.1} />
                                        <XAxis dataKey="time" stroke="#92400e" strokeOpacity={0.3} />
                                        <YAxis domain={[0, "auto"]} stroke="#92400e" strokeOpacity={0.3} />
                                        <Tooltip contentStyle={{ backgroundColor: "#fbbf24", color: "#92400e", borderRadius: "10px", border: "none" }}
                                            itemStyle={{ color: "#92400e" }}
                                            formatter={(value, name) => [`${value} min`, name === "Cooking Time" ? "Cooking Time" : "Time"]}
                                            labelFormatter={(label) => `Time: ${label}`}
                                        />
                                        <Legend verticalAlign="top" wrapperStyle={{ color: "#92400e", fontSize: "16px", paddingBottom: "20px" }} />
                                        <Line type="monotone" dataKey="cooking_time" name="Cooking Time" stroke="#fbbf24" strokeWidth={2} strokeOpacity={0.7} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="cooking-placeholder"></div>
                        )}
                    </div>

                    <div className="card">
                        <div className="card-header">
                            <span role="img" aria-label="rice">🍚</span>
                            <span className="card-title">1/2 kg Rice Cooking Time at Peak Temp</span>
                            <span className="status-pill active">Active</span>
                        </div>
                        <div style={{flex: 1}}></div>
                        <button className="btn-secondary" onClick={get_rice_peak} disabled={loading} style={{alignSelf: 'flex-end', marginTop: 'auto'}}>
                            {loading ? <span className="spinner"></span> : "Predict"}
                        </button>
                        {rice_peak.length > 0 ? (
                            <div className="chart-container">
                                <ResponsiveContainer width="100%" height={200}>
                                    <LineChart data={rice_peak}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#fbbf24" strokeOpacity={0.1} />
                                        <XAxis dataKey="time" stroke="#92400e" strokeOpacity={0.3} />
                                        <YAxis domain={[0, "auto"]} stroke="#92400e" strokeOpacity={0.3} />
                                        <Tooltip contentStyle={{ backgroundColor: "#fbbf24", color: "#92400e", borderRadius: "10px", border: "none" }}
                                            itemStyle={{ color: "#92400e" }}
                                            formatter={(value, name) => [`${value} min`, name === "Cooking Time" ? "Cooking Time" : "Time"]}
                                            labelFormatter={(label) => `Time: ${label}`}
                                        />
                                        <Legend verticalAlign="top" wrapperStyle={{ color: "#92400e", fontSize: "16px", paddingBottom: "20px" }} />
                                        <Line type="monotone" dataKey="cooking_time" name="Cooking Time" stroke="#fbbf24" strokeWidth={2} strokeOpacity={0.7} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="cooking-placeholder"></div>
                        )}
                    </div>

                    <div className="prediction-card">
                        <div className="prediction-card-header">
                            <span role="img" aria-label="sambar">🥣</span>
                            <span className="prediction-card-title">1/2 kg Sambar Cooking Time at Room Temp</span>
                            <span className="status-pill active">Active</span>
                        </div>
                        <div className="prediction-card-button">
                            <button className="btn-secondary" onClick={get_sambar_room} disabled={loading}>
                                {loading ? <span className="spinner"></span> : "Predict"}
                            </button>
                        </div>
                        {sambar_room.length > 0 ? (
                            <div className="chart-container">
                                <ResponsiveContainer width="100%" height={200}>
                                    <LineChart data={sambar_room}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#fed7aa" strokeOpacity={0.1} />
                                        <XAxis dataKey="time" stroke="#92400e" strokeOpacity={0.3} />
                                        <YAxis domain={[0, "auto"]} stroke="#92400e" strokeOpacity={0.3} />
                                        <Tooltip contentStyle={{ backgroundColor: "#fed7aa", color: "#92400e", borderRadius: "10px", border: "none" }}
                                            itemStyle={{ color: "#92400e" }}
                                            formatter={(value, name) => [`${value} min`, name === "Cooking Time" ? "Cooking Time" : "Time"]}
                                            labelFormatter={(label) => `Time: ${label}`}
                                        />
                                        <Legend verticalAlign="top" wrapperStyle={{ color: "#92400e", fontSize: "16px", paddingBottom: "20px" }} />
                                        <Line type="monotone" dataKey="cooking_time" name="Cooking Time" stroke="#fed7aa" strokeWidth={2} strokeOpacity={0.7} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="cooking-placeholder"></div>
                        )}
                    </div>

                    <div className="prediction-card">
                        <div className="prediction-card-header">
                            <span role="img" aria-label="sambar">🥣</span>
                            <span className="prediction-card-title">1/2 kg Sambar Cooking Time at Peak Temp</span>
                            <span className="status-pill active">Active</span>
                        </div>
                        <div className="prediction-card-button">
                            <button className="btn-secondary" onClick={get_sambar_peak} disabled={loading}>
                                {loading ? <span className="spinner"></span> : "Predict"}
                            </button>
                        </div>
                        {sambar_peak.length > 0 ? (
                            <div className="chart-container">
                                <ResponsiveContainer width="100%" height={200}>
                                    <LineChart data={sambar_peak}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#fed7aa" strokeOpacity={0.1} />
                                        <XAxis dataKey="time" stroke="#92400e" strokeOpacity={0.3} />
                                        <YAxis domain={[0, "auto"]} stroke="#92400e" strokeOpacity={0.3} />
                                        <Tooltip contentStyle={{ backgroundColor: "#fed7aa", color: "#92400e", borderRadius: "10px", border: "none" }}
                                            itemStyle={{ color: "#92400e" }}
                                            formatter={(value, name) => [`${value} min`, name === "Cooking Time" ? "Cooking Time" : "Time"]}
                                            labelFormatter={(label) => `Time: ${label}`}
                                        />
                                        <Legend verticalAlign="top" wrapperStyle={{ color: "#92400e", fontSize: "16px", paddingBottom: "20px" }} />
                                        <Line type="monotone" dataKey="cooking_time" name="Cooking Time" stroke="#fed7aa" strokeWidth={2} strokeOpacity={0.7} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="cooking-placeholder"></div>
                        )}
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="footer">
                <div className="footer-icons">
                    <span role="img" aria-label="leaf">🌱</span>
                    <span role="img" aria-label="bolt">⚡</span>
                    <span role="img" aria-label="sun">☀️</span>
            </div>
                <div className="footer-text">
                    Powered by sustainable technology and AI predictions
                </div>
            </footer>
        </div>
    );
}

export default HomePage;

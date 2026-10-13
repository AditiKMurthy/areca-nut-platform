import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { Camera, MapPin, Sprout, Bell, CloudRain, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default Leaflet marker icon issue in Vite builds
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// Component to handle map click events for pinning location
function LocationPicker({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });
  return position === null ? null : <Marker position={position}></Marker>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [position, setPosition] = useState([13.3161, 75.7720]); // Default to central Areca nut belt (Shivamogga/Karnataka region)
  const [growthStage, setGrowthStage] = useState('Juvenile Palm');
  const [capturedImage, setCapturedImage] = useState(null);
  const [backendStatus, setBackendStatus] = useState('Checking...');
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
  );

  // Check connection to FastAPI backend
  useEffect(() => {
    fetch('http://localhost:8000/api/health')
      .then((res) => res.json())
      .then((data) => setBackendStatus(data.status))
      .catch(() => setBackendStatus('Offline (Mock Mode active)'));
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setInstallPrompt(null);
  };

// Real API Call to FastAPI Backend
  const handleRunAnalysis = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latitude: position[0],
          longitude: position[1],
          growth_stage: growthStage
        }),
      });

      const result = await response.json();
      if (result.success) {
        setFeedbacks([result.data.recommendations]);
      } else {
        alert('Failed to generate advisory from backend.');
      }
    } catch (err) {
      console.error('Error connecting to backend:', err);
      alert('Could not reach FastAPI backend. Make sure uvicorn is running on port 8000.');
    } finally {
      setLoading(false);
      setActiveTab('dashboard');
    }
  };

  const stages = [
    'Seedling / Nursery',
    'Juvenile Palm',
    'Pre-Bearing',
    'Bearing / Full Production'
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 font-sans max-w-md mx-auto shadow-2xl border-x border-slate-200">
      
      {/* Top Header */}
      <header className="bg-emerald-700 text-white p-4 sticky top-0 z-50 shadow-md flex justify-between items-center">
        <div>
          <h1 className="font-bold text-lg flex items-center gap-2">
            <Sprout className="w-5 h-5 text-emerald-300" /> ArecaSmart Advisor
          </h1>
          <p className="text-xs text-emerald-100">Backend: <span className="underline font-mono">{backendStatus}</span></p>
        </div>
        <div className="bg-emerald-800 px-2.5 py-1 rounded-full text-xs font-medium text-emerald-200 border border-emerald-600">
          PWA Active
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 pb-20 overflow-y-auto">
        
        {/* TAB 1: DASHBOARD FEED */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            {installPrompt && !isInstalled && (
              <div className="bg-emerald-800 text-white px-4 py-2.5 flex justify-between items-center text-xs shadow-inner border-b border-emerald-600">
                <span>📱 Install ArecaSmart on your home screen for quick access!</span>
                <button
                  onClick={handleInstallClick}
                  className="bg-white text-emerald-800 font-bold px-3 py-1 rounded shadow hover:bg-emerald-50 transition"
                >
                  Install App
                </button>
              </div>
            )}

            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <h2 className="font-semibold text-slate-700 mb-2 flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-emerald-600" /> Active Farmland Coordinates
              </h2>
              <div className="text-xs font-mono bg-slate-100 p-2 rounded text-slate-600 mb-3">
                Lat: {position[0].toFixed(4)}, Lng: {position[1].toFixed(4)}
              </div>
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span>Stage: <strong className="text-emerald-700">{growthStage}</strong></span>
                <button 
                  onClick={() => setActiveTab('setup')} 
                  className="text-emerald-600 font-semibold hover:underline"
                >
                  Change Field/Stage
                </button>
              </div>
            </div>

            {/* Dynamic Feedback Cards */}
            <h3 className="font-bold text-slate-800 text-sm tracking-wide uppercase mt-4">Agronomic Action Feed</h3>

            {feedbacks.length === 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
                <CloudRain className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <h4 className="font-semibold text-emerald-800 text-sm">No analysis generated yet</h4>
                <p className="text-xs text-emerald-600 mt-1 mb-4">Configure your stage and pin your farm to fetch tailored default rule responses.</p>
                <button 
                  onClick={() => setActiveTab('setup')}
                  className="bg-emerald-600 text-white text-xs font-medium px-4 py-2 rounded-lg shadow hover:bg-emerald-700"
                >
                  Setup Farm & Generate
                </button>
              </div>
            ) : (
              feedbacks.map((fb, idx) => (
                <div key={idx} className="space-y-3">
                  {/* Fertilization Card */}
                  <div className="bg-white border-l-4 border-amber-500 p-4 rounded-r-xl shadow-sm space-y-1">
                    <div className="flex items-center gap-2 text-amber-700 font-semibold text-xs uppercase">
                      <CheckCircle className="w-4 h-4" /> Fertilization Prescription
                    </div>
                    <p className="text-sm text-slate-700">{fb.fertilizer}</p>
                  </div>

                  {/* Irrigation Card */}
                  <div className="bg-white border-l-4 border-blue-500 p-4 rounded-r-xl shadow-sm space-y-1">
                    <div className="flex items-center gap-2 text-blue-700 font-semibold text-xs uppercase">
                      <CloudRain className="w-4 h-4" /> Irrigation Recommendation
                    </div>
                    <p className="text-sm text-slate-700">{fb.irrigation}</p>
                  </div>

                  {/* Alert Card */}
                  <div className="bg-white border-l-4 border-rose-500 p-4 rounded-r-xl shadow-sm space-y-1">
                    <div className="flex items-center gap-2 text-rose-700 font-semibold text-xs uppercase">
                      <AlertTriangle className="w-4 h-4" /> Environmental & Health Alert
                    </div>
                    <p className="text-sm text-slate-700">{fb.alert}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: FIELD SETUP & MAP PINNING */}
        {activeTab === 'setup' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
              <h2 className="font-semibold text-slate-800 text-sm">1. Select Growth Stage</h2>
              <select 
                value={growthStage} 
                onChange={(e) => setGrowthStage(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                {stages.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-2">
              <h2 className="font-semibold text-slate-800 text-sm flex items-center justify-between">
                <span>2. Pin Field Location</span>
                <span className="text-xs font-normal text-slate-500">Tap map to move pin</span>
              </h2>
              
              {/* Leaflet Map Container */}
              <div className="h-64 w-full rounded-lg overflow-hidden border border-slate-200 z-0 relative">
                <MapContainer center={position} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <LocationPicker position={position} setPosition={setPosition} />
                </MapContainer>
              </div>
            </div>

            <button
              onClick={handleRunAnalysis}
              disabled={loading}
              className="w-full bg-emerald-600 text-white font-medium py-3 rounded-xl shadow hover:bg-emerald-700 transition flex items-center justify-center gap-2 text-sm"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sprout className="w-4 h-4" />}
              {loading ? 'Processing Default Rules...' : 'Save Field & Fetch Insights'}
            </button>
          </div>
        )}

        {/* TAB 3: CAMERA UPLOAD */}
        {activeTab === 'camera' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center space-y-3">
              <h2 className="font-semibold text-slate-800 text-sm text-left">Upload Crop or Leaf Photo</h2>
              <p className="text-xs text-slate-500 text-left">Snap a picture of your areca nut canopy or leaf structure to record visual growth milestones.</p>
              
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center bg-slate-50 relative">
                {capturedImage ? (
                  <img src={capturedImage} alt="Captured crop" className="max-h-48 rounded-lg object-cover shadow" />
                ) : (
                  <>
                    <Camera className="w-12 h-12 text-slate-400 mb-2" />
                    <span className="text-xs text-slate-600 font-medium">No photo selected</span>
                  </>
                )}
                
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment" 
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setCapturedImage(URL.createObjectURL(e.target.files[0]));
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>

              <p className="text-xs text-emerald-600 font-medium">Tap box above to open phone camera or select file.</p>

              {capturedImage && (
                <button 
                  onClick={() => {
                    alert('Photo uploaded successfully to local session storage!');
                    setActiveTab('dashboard');
                  }}
                  className="w-full bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-medium shadow hover:bg-emerald-700"
                >
                  Confirm & Upload Image
                </button>
              )}
            </div>
          </div>
        )}

      </main>

      {/* Bottom Navigation Bar (Mobile Thumb-Friendly) */}
      <nav className="bg-white border-t border-slate-200 fixed bottom-0 left-0 right-0 max-w-md mx-auto flex justify-around p-3 z-50 shadow-lg">
        <button 
          onClick={() => setActiveTab('dashboard')} 
          className={`flex flex-col items-center text-xs font-medium ${activeTab === 'dashboard' ? 'text-emerald-600' : 'text-slate-400'}`}
        >
          <Bell className="w-5 h-5 mb-1" /> Dashboard
        </button>
        <button 
          onClick={() => setActiveTab('setup')} 
          className={`flex flex-col items-center text-xs font-medium ${activeTab === 'setup' ? 'text-emerald-600' : 'text-slate-400'}`}
        >
          <MapPin className="w-5 h-5 mb-1" /> Farm Map
        </button>
        <button 
          onClick={() => setActiveTab('camera')} 
          className={`flex flex-col items-center text-xs font-medium ${activeTab === 'camera' ? 'text-emerald-600' : 'text-slate-400'}`}
        >
          <Camera className="w-5 h-5 mb-1" /> Snap Photo
        </button>
      </nav>

    </div>
  );
}
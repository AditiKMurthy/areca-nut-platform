import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import {
  AlertTriangle,
  Bell,
  Camera,
  CheckCircle,
  CloudRain,
  CloudSun,
  Droplets,
  LocateFixed,
  MapPin,
  RefreshCw,
  Satellite,
  Sprout,
  Thermometer,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './App.css';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const routePaths = {
  login: '/login',
  setup: '/farm-setup',
  dashboard: '/dashboard',
};

function getRoute(pathname) {
  return Object.keys(routePaths).find((route) => routePaths[route] === pathname) ?? 'login';
}

function LocationPicker({ position, setPosition }) {
  useMapEvents({
    click(event) {
      setPosition([event.latlng.lat, event.latlng.lng]);
    },
  });

  return position === null ? null : (
    <Marker
      position={position}
      draggable
      eventHandlers={{
        dragend(event) {
          const marker = event.target;
          const { lat, lng } = marker.getLatLng();
          setPosition([lat, lng]);
        },
      }}
    />
  );
}

function MapInstanceCapture({ mapRef }) {
  const map = useMap();

  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);

  return null;
}

function BottomNavigation({ activeRoute, navigate }) {
  return (
    <nav className="bottom-navigation" aria-label="Main navigation">
      <button
        type="button"
        onClick={() => navigate('dashboard')}
        className={`nav-item ${activeRoute === 'dashboard' ? 'is-active' : ''}`}
        aria-current={activeRoute === 'dashboard' ? 'page' : undefined}
      >
        <Bell aria-hidden="true" />
        <span>Dashboard</span>
      </button>
      <button
        type="button"
        onClick={() => navigate('setup')}
        className={`nav-item ${activeRoute === 'setup' ? 'is-active' : ''}`}
        aria-current={activeRoute === 'setup' ? 'page' : undefined}
      >
        <MapPin aria-hidden="true" />
        <span>Farm setup</span>
      </button>
    </nav>
  );
}

export default function App() {
  const [activeRoute, setActiveRoute] = useState(() => getRoute(window.location.pathname));
  const [position, setPosition] = useState([13.3161, 75.772]);
  const mapRef = useRef(null);
  const [growthStage, setGrowthStage] = useState('Juvenile Palm');
  const [locationError, setLocationError] = useState('');
  const [locating, setLocating] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [backendStatus, setBackendStatus] = useState('Checking...');
  const [feedbacks, setFeedbacks] = useState([]);
  const [environmentalMetrics, setEnvironmentalMetrics] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [loading, setLoading] = useState(false);
  const summaryRequestRef = useRef('');
  const photoInputRef = useRef(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches,
  );

  useEffect(() => {
    if (window.location.pathname !== routePaths[activeRoute]) {
      window.history.replaceState({}, '', routePaths[activeRoute]);
    }

    const handlePopState = () => setActiveRoute(getRoute(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeRoute]);

  useEffect(() => {
    fetch('http://localhost:8000/api/health')
      .then((response) => response.json())
      .then((data) => setBackendStatus(data.status))
      .catch(() => setBackendStatus('Offline (Mock Mode active)'));
  }, []);

  useEffect(() => {
    const coordinates = `${position[0]},${position[1]}|${growthStage}`;
    if (activeRoute !== 'dashboard' || summaryRequestRef.current === coordinates) return;

    const loadDashboardData = async () => {
      summaryRequestRef.current = coordinates;
      setSummaryLoading(true);
      setSummaryError('');

      try {
        const response = await fetch('http://localhost:8000/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: position[0],
            longitude: position[1],
            growth_stage: growthStage,
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.detail ?? 'Could not load farm conditions.');
        }

        const recommendations = result.data.recommendations;
        setEnvironmentalMetrics(result.data.environmental_metrics);
        setFeedbacks([{
          fertilizer: recommendations.fertilization,
          irrigation: recommendations.irrigation,
          alert: recommendations.alert,
        }]);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        setSummaryError('Live farm conditions are unavailable. Check your connection and try again from farm setup.');
      } finally {
        setSummaryLoading(false);
      }
    };

    loadDashboardData();
  }, [activeRoute, growthStage, position]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const navigate = (route) => {
    if (!routePaths[route] || route === activeRoute) return;
    window.history.pushState({}, '', routePaths[route]);
    setActiveRoute(route);
    window.scrollTo(0, 0);
  };

  const handleInstallClick = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setIsInstalled(true);
    setInstallPrompt(null);
  };

  const handleRunAnalysis = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: position[0],
          longitude: position[1],
          growth_stage: growthStage,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.detail ?? 'Failed to generate advisory from backend.');
      }

      const recommendations = result.data.recommendations;
      setFeedbacks([{
        fertilizer: recommendations.fertilization,
        irrigation: recommendations.irrigation,
        alert: recommendations.alert,
      }]);
      setEnvironmentalMetrics(result.data.environmental_metrics);
      const coordinates = `${position[0]},${position[1]}|${growthStage}`;
      summaryRequestRef.current = coordinates;
      setSummaryError('');
      navigate('dashboard');
    } catch (error) {
      console.error('Error connecting to backend:', error);
      alert(error.message || 'Could not reach FastAPI backend. Make sure uvicorn is running on port 8000.');
    } finally {
      setLoading(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Location services are not supported by this browser.');
      return;
    }

    setLocating(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const currentPosition = [coords.latitude, coords.longitude];
        setPosition(currentPosition);
        mapRef.current?.setView(currentPosition, 15);
        setLocating(false);
      },
      (error) => {
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. You can still pin your farm on the map.'
            : 'Could not get your location. Please pin your farm on the map.',
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const stages = [
    'Seedling / Nursery',
    'Juvenile Palm',
    'Pre-Bearing',
    'Bearing',
    'Harvest',
  ];

  return (
    <div className="app-shell">
      {activeRoute !== 'login' && (
        <header className="top-bar">
          <a
            className="brand"
            href={routePaths.dashboard}
            onClick={(event) => {
              event.preventDefault();
              navigate('dashboard');
            }}
          >
            <span className="brand-mark"><Sprout aria-hidden="true" /></span>
            <span className="brand-copy">
              <strong>ArecaSmart</strong>
              <span>Farm advisor</span>
            </span>
          </a>

          <nav className="desktop-navigation" aria-label="Main navigation">
            <button
              type="button"
              onClick={() => navigate('dashboard')}
              className={activeRoute === 'dashboard' ? 'is-active' : ''}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => navigate('setup')}
              className={activeRoute === 'setup' ? 'is-active' : ''}
            >
              Farm setup
            </button>
          </nav>

          <div className="connection-status">
            <span className="status-dot" />
            <span className="status-label">{backendStatus}</span>
          </div>
        </header>
      )}

      <main className={`page-content ${activeRoute === 'login' ? 'login-page' : ''} ${activeRoute === 'dashboard' ? 'dashboard-page' : ''}`}>
        {activeRoute === 'login' && (
          <section className="login-card" aria-labelledby="login-title">
            <div className="login-brand" aria-label="ArecaSmart">
              <span className="login-brand-mark"><Sprout aria-hidden="true" /></span>
              <span>ArecaSmart</span>
            </div>
            <p className="eyebrow">Welcome to your farm</p>
            <h1 id="login-title">Grow with confidence.</h1>
            <p className="login-description">
              Get practical, field-specific guidance for your areca nut farm.
            </p>
            <button
              type="button"
              className="google-button"
              onClick={() => navigate('setup')}
            >
              <svg className="google-icon" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#4285F4" d="M43.6 24.5c0-1.6-.14-3.14-.4-4.64H24v8.77h11c-.48 2.6-1.94 4.8-4.13 6.27l6.68 5.18c3.9-3.6 6.05-8.9 6.05-15.58Z" />
                <path fill="#34A853" d="M24 44c5.58 0 10.27-1.85 13.69-5.02l-6.68-5.18c-1.85 1.24-4.22 1.98-7.01 1.98-5.39 0-9.96-3.64-11.59-8.54l-6.9 5.32C8.9 39.3 15.9 44 24 44Z" />
                <path fill="#FBBC05" d="M12.41 27.24a12.1 12.1 0 0 1 0-6.48l-6.9-5.32a20.2 20.2 0 0 0 0 17.12l6.9-5.32Z" />
                <path fill="#EA4335" d="M24 8.22c3.04 0 5.77 1.05 7.92 3.1l5.94-5.94C34.26 2.02 29.57 0 24 0 15.9 0 8.9 4.7 5.51 11.56l6.9 5.32C14.04 11.86 18.61 8.22 24 8.22Z" transform="translate(0 2)" />
              </svg>
              Continue with Google
            </button>
            <p className="prototype-note">Google authentication is not connected in this demo.</p>
          </section>
        )}

        {activeRoute === 'setup' && (
          <section className="view-section" aria-labelledby="setup-title">
            <div className="page-heading">
              <p className="eyebrow">Your farm profile</p>
              <h1 id="setup-title">Farm setup &amp; map</h1>
              <p>Choose your crop stage and pin the location of your field.</p>
            </div>

            <div className="setup-grid">
              <section className="content-card stage-card">
                <div className="step-heading">
                  <span className="step-number">1</span>
                  <div>
                    <h2>Growth stage</h2>
                    <p>Choose the stage that best describes your palms.</p>
                  </div>
                </div>
                <label className="field-label" htmlFor="growth-stage">Crop stage</label>
                <select
                  id="growth-stage"
                  value={growthStage}
                  onChange={(event) => setGrowthStage(event.target.value)}
                >
                  {stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                </select>
              </section>

              <section className="content-card map-card">
                <div className="step-heading">
                  <span className="step-number">2</span>
                  <div>
                    <h2>Field location</h2>
                    <p>Tap the map or drag the pin to your farm.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="location-button"
                  onClick={handleUseCurrentLocation}
                  disabled={locating}
                >
                  <LocateFixed aria-hidden="true" />
                  {locating ? 'Finding your location...' : 'Use my current location'}
                </button>
                <div className="map-frame">
                  <MapContainer center={position} zoom={13} scrollWheelZoom={false}>
                    <MapInstanceCapture mapRef={mapRef} />
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <LocationPicker position={position} setPosition={setPosition} />
                  </MapContainer>
                </div>
                <div className="coordinate-readout" aria-live="polite">
                  <p className="coordinates">
                    <MapPin aria-hidden="true" />
                    Selected farm coordinates
                  </p>
                  <div className="coordinate-values">
                    <p><span>Latitude</span><strong>{position[0].toFixed(6)}</strong></p>
                    <p><span>Longitude</span><strong>{position[1].toFixed(6)}</strong></p>
                  </div>
                </div>
                {locationError && <p className="location-error" role="alert">{locationError}</p>}
              </section>
            </div>

            <button
              type="button"
              onClick={handleRunAnalysis}
              disabled={loading}
              className="primary-button analysis-button"
            >
              {loading ? <RefreshCw className="spinning" aria-hidden="true" /> : <Sprout aria-hidden="true" />}
              {loading ? 'Generating your insights...' : 'Save farm & generate insights'}
            </button>
          </section>
        )}

        {activeRoute === 'dashboard' && (
          <section className="view-section" aria-labelledby="dashboard-title">
            <div className="page-heading dashboard-heading">
              <div>
                <p className="eyebrow">Your growing season</p>
                <h1 id="dashboard-title">Farm dashboard</h1>
                <p>Practical guidance for your areca nut farm.</p>
              </div>
              <button type="button" className="secondary-button" onClick={() => navigate('setup')}>
                <MapPin aria-hidden="true" /> Edit farm
              </button>
            </div>

            {installPrompt && !isInstalled && (
              <aside className="install-banner">
                <span>Install ArecaSmart on your home screen for quick access.</span>
                <button type="button" onClick={handleInstallClick}>Install app</button>
              </aside>
            )}

            <section className="conditions-card" aria-label="Farm conditions summary">
              <div className="conditions-heading">
                <div>
                  <p className="eyebrow">Field conditions</p>
                  <h2>Today on your farm</h2>
                </div>
                <span className={`live-indicator ${summaryLoading ? 'is-loading' : ''}`}>
                  <span />
                  {summaryLoading ? 'Updating' : environmentalMetrics ? 'Live' : 'Unavailable'}
                </span>
              </div>
              <div className="conditions-grid">
                <article className="weather-summary">
                  <div className="condition-label">
                    <CloudSun aria-hidden="true" />
                    <span>Local weather</span>
                  </div>
                  {environmentalMetrics ? (
                    <>
                      <p className="weather-temperature">
                        <Thermometer aria-hidden="true" />
                        {Number(environmentalMetrics.temperature_c).toFixed(1)}°
                      </p>
                      <p className="weather-details">
                        <span><Droplets aria-hidden="true" /> {environmentalMetrics.relative_humidity_pct}% humidity</span>
                        <span><CloudRain aria-hidden="true" /> {Number(environmentalMetrics.forecast_rain_mm).toFixed(1)} mm avg rain</span>
                      </p>
                    </>
                  ) : (
                    <p className="condition-unavailable">
                      {summaryLoading ? 'Fetching current conditions...' : 'Weather data will appear when available.'}
                    </p>
                  )}
                </article>
                <article className="ndvi-summary">
                  <div className="condition-label">
                    <Satellite aria-hidden="true" />
                    <span>Satellite NDVI</span>
                  </div>
                  <div className="ndvi-unavailable">
                    <span aria-hidden="true">--</span>
                    <p>Trend unavailable</p>
                  </div>
                  <p className="ndvi-caption">Satellite imagery is not connected yet.</p>
                </article>
              </div>
              <div className="farm-summary-inline">
                <MapPin aria-hidden="true" />
                <span>{position[0].toFixed(4)}, {position[1].toFixed(4)}</span>
                <span className="stage-badge">{growthStage}</span>
              </div>
            </section>

            {summaryError && <p className="dashboard-error" role="status">{summaryError}</p>}

            <div className="section-title">
              <div>
                <p className="eyebrow">Farm recommendations</p>
                <h2>Agronomic action feed</h2>
              </div>
              <Sprout aria-hidden="true" />
            </div>

            <div className="recommendation-list">
              <article className="recommendation-card fertilizer-card">
                <div><CheckCircle aria-hidden="true" /><h3>Fertilizer advice</h3></div>
                <p className={feedbacks[0]?.fertilizer ? '' : 'is-pending'}>
                  {feedbacks[0]?.fertilizer ?? 'Personalized fertilizer advice will appear after farm conditions load.'}
                </p>
              </article>
              <article className="recommendation-card irrigation-card">
                <div><CloudRain aria-hidden="true" /><h3>Irrigation steps</h3></div>
                <p className={feedbacks[0]?.irrigation ? '' : 'is-pending'}>
                  {feedbacks[0]?.irrigation ?? 'Irrigation guidance will appear after farm conditions load.'}
                </p>
              </article>
              <article className="recommendation-card alert-card">
                <div><AlertTriangle aria-hidden="true" /><h3>Proactive alerts</h3></div>
                <p className={feedbacks[0]?.alert ? '' : 'is-pending'}>
                  {feedbacks[0]?.alert ?? 'Weather and crop health alerts will appear after farm conditions load.'}
                </p>
              </article>
            </div>

            {capturedImage && (
              <section className="photo-preview-card" aria-label="Selected crop photo">
                <img src={capturedImage} alt="Selected crop" className="crop-preview" />
                <span>Photo ready to review</span>
              </section>
            )}
          </section>
        )}
      </main>

      {activeRoute === 'dashboard' && (
        <>
          <input
            ref={photoInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Choose a crop photo"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) setCapturedImage(URL.createObjectURL(file));
              event.currentTarget.value = '';
            }}
          />
          <button
            type="button"
            className="camera-fab"
            onClick={() => photoInputRef.current?.click()}
            aria-label="Take or upload a crop photo"
          >
            <Camera aria-hidden="true" />
            <span>{capturedImage ? 'Photo added' : 'Add photo'}</span>
          </button>
        </>
      )}

      {activeRoute !== 'login' && (
        <BottomNavigation activeRoute={activeRoute} navigate={navigate} />
      )}
    </div>
  );
}

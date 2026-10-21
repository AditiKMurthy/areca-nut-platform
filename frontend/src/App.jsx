import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import {
  AlertTriangle,
  Bell,
  Camera,
  CheckCircle,
  CloudRain,
  MapPin,
  RefreshCw,
  Sprout,
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

  return position === null ? null : <Marker position={position} />;
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
  const [growthStage, setGrowthStage] = useState('Juvenile Palm');
  const [capturedImage, setCapturedImage] = useState(null);
  const [backendStatus, setBackendStatus] = useState('Checking...');
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(false);
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
      if (result.success) {
        setFeedbacks([result.data.recommendations]);
        navigate('dashboard');
      } else {
        alert('Failed to generate advisory from backend.');
      }
    } catch (error) {
      console.error('Error connecting to backend:', error);
      alert('Could not reach FastAPI backend. Make sure uvicorn is running on port 8000.');
    } finally {
      setLoading(false);
    }
  };

  const stages = [
    'Seedling / Nursery',
    'Juvenile Palm',
    'Pre-Bearing',
    'Bearing / Full Production',
  ];

  return (
    <div className="app-shell">
      <header className="top-bar">
        <a
          className="brand"
          href={routePaths.dashboard}
          onClick={(event) => {
            event.preventDefault();
            navigate(activeRoute === 'login' ? 'login' : 'dashboard');
          }}
        >
          <span className="brand-mark"><Sprout aria-hidden="true" /></span>
          <span className="brand-copy">
            <strong>ArecaSmart</strong>
            <span>Farm advisor</span>
          </span>
        </a>

        {activeRoute !== 'login' && (
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
        )}

        <div className="connection-status">
          <span className="status-dot" />
          <span className="status-label">{backendStatus}</span>
        </div>
      </header>

      <main className={`page-content ${activeRoute === 'login' ? 'login-page' : ''}`}>
        {activeRoute === 'login' && (
          <section className="login-card" aria-labelledby="login-title">
            <div className="login-icon"><Sprout aria-hidden="true" /></div>
            <p className="eyebrow">Welcome to ArecaSmart</p>
            <h1 id="login-title">Your farm, at a glance.</h1>
            <p className="login-description">
              Sign in to manage your areca nut farm and get timely, field-specific guidance.
            </p>
            <form
              className="login-form"
              onSubmit={(event) => {
                event.preventDefault();
                navigate('setup');
              }}
            >
              <label htmlFor="email">Email address</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
              <button type="submit" className="primary-button">Continue to farm setup</button>
            </form>
            <p className="prototype-note">Account authentication can be connected to your service.</p>
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
                    <p>Tap the map to move the pin to your farm.</p>
                  </div>
                </div>
                <div className="map-frame">
                  <MapContainer center={position} zoom={13} scrollWheelZoom={false}>
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <LocationPicker position={position} setPosition={setPosition} />
                  </MapContainer>
                </div>
                <p className="coordinates">
                  <MapPin aria-hidden="true" />
                  {position[0].toFixed(4)}, {position[1].toFixed(4)}
                </p>
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

            <section className="content-card farm-summary">
              <div className="summary-icon"><MapPin aria-hidden="true" /></div>
              <div className="summary-details">
                <h2>Active farmland</h2>
                <p>{position[0].toFixed(4)}, {position[1].toFixed(4)}</p>
              </div>
              <div className="stage-badge">{growthStage}</div>
            </section>

            <div className="section-title">
              <div>
                <p className="eyebrow">Farm recommendations</p>
                <h2>Agronomic action feed</h2>
              </div>
              <Sprout aria-hidden="true" />
            </div>

            {feedbacks.length === 0 ? (
              <section className="empty-state">
                <div className="empty-icon"><CloudRain aria-hidden="true" /></div>
                <h3>Your insights are on the way</h3>
                <p>Set up your field location and crop stage to generate tailored farm recommendations.</p>
                <button type="button" className="primary-button" onClick={() => navigate('setup')}>
                  Set up your farm
                </button>
              </section>
            ) : (
              <div className="recommendation-list">
                {feedbacks.map((feedback, index) => (
                  <div className="recommendation-group" key={index}>
                    <article className="recommendation-card fertilizer-card">
                      <div><CheckCircle aria-hidden="true" /><h3>Fertilization</h3></div>
                      <p>{feedback.fertilizer}</p>
                    </article>
                    <article className="recommendation-card irrigation-card">
                      <div><CloudRain aria-hidden="true" /><h3>Irrigation</h3></div>
                      <p>{feedback.irrigation}</p>
                    </article>
                    <article className="recommendation-card alert-card">
                      <div><AlertTriangle aria-hidden="true" /><h3>Environmental &amp; health alert</h3></div>
                      <p>{feedback.alert}</p>
                    </article>
                  </div>
                ))}
              </div>
            )}

            <section className="content-card photo-card">
              <div className="photo-copy">
                <div className="photo-icon"><Camera aria-hidden="true" /></div>
                <div>
                  <h2>Record a crop photo</h2>
                  <p>Capture a visual milestone from your field.</p>
                </div>
              </div>
              <label className="upload-button">
                {capturedImage ? 'Choose another photo' : 'Take or choose photo'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) setCapturedImage(URL.createObjectURL(file));
                  }}
                />
              </label>
              {capturedImage && <img src={capturedImage} alt="Selected crop" className="crop-preview" />}
            </section>
          </section>
        )}
      </main>

      {activeRoute !== 'login' && (
        <BottomNavigation activeRoute={activeRoute} navigate={navigate} />
      )}
    </div>
  );
}

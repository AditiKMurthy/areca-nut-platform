import { useState, useEffect } from 'react';

function App() {
  const [status, setStatus] = useState('Connecting to backend...');

  useEffect(() => {
    fetch('http://localhost:8000/api/health')
      .then((res) => res.json())
      .then((data) => setStatus(data.message))
      .catch((err) => setStatus('Failed to connect to backend'));
  }, []);

  return (
    <div style={{ fontFamily: 'sans-serif', textAlign: 'center', marginTop: '50px' }}>
      <h1>Areca Nut Platform</h1>
      <p>Backend Status: <strong>{status}</strong></p>
    </div>
  );
}

export default App;
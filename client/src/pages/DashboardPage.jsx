import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { api } from '../utils/api.js';

export default function DashboardPage() {
  const { user, sessionToken, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    refreshUser();
  }, []);

  useEffect(() => {
    if (!sessionToken) return;
    api.getLoginHistory(sessionToken)
      .then(d => setHistory(d.attempts))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [sessionToken]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const factors = user?.factorsEnrolled || {};

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-logo">Déjà View</div>
        <div className="dashboard-user">
          <span>{user?.username}</span>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-welcome">
          <h2>Authentication successful</h2>
          <p>All three factors verified. You are securely authenticated.</p>
        </div>

        {/* Factor status cards */}
        <section className="factor-status-grid">
          <FactorCard
            icon="🖼"
            label="Secret image"
            description="SHA-256 file fingerprint"
            active={factors.imageHash}
          />
          <FactorCard
            icon="👤"
            label="Face biometric"
            description="Local face descriptor"
            active={factors.face}
          />
          <FactorCard
            icon="🔐"
            label="Authenticator"
            description="TOTP one-time code"
            active={factors.totp}
          />
          <FactorCard
            icon="📱"
            label="Phone passkey"
            description="Face ID / fingerprint"
            active={factors.passkey}
          />
        </section>

        {/* Login history */}
        <section className="login-history">
          <h3>Recent login activity</h3>
          {loadingHistory ? (
            <p className="muted">Loading…</p>
          ) : history.length === 0 ? (
            <p className="muted">No login history yet.</p>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Result</th>
                  <th>Failed factor</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {history.map((a, i) => (
                  <tr key={i} className={a.success ? 'success' : 'failure'}>
                    <td>{new Date(a.attempted_at * 1000).toLocaleString()}</td>
                    <td>
                      <span className={`badge ${a.success ? 'badge-success' : 'badge-error'}`}>
                        {a.success ? 'Success' : 'Failed'}
                      </span>
                    </td>
                    <td>{a.factor || '—'}</td>
                    <td className="ip-cell">{a.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}

function FactorCard({ icon, label, description, active }) {
  return (
    <div className={`factor-card ${active ? 'active' : 'inactive'}`}>
      <span className="factor-icon">{icon}</span>
      <div className="factor-info">
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <span className={`factor-badge ${active ? 'enrolled' : 'missing'}`}>
        {active ? '✓ Enrolled' : '✗ Missing'}
      </span>
    </div>
  );
}

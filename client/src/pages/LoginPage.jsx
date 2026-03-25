import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import StepIndicator from '../components/StepIndicator.jsx';
import ImagePicker from '../components/ImagePicker.jsx';
import WebcamCapture from '../components/WebcamCapture.jsx';
import Alert from '../components/Alert.jsx';
import { api } from '../utils/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { loadRegistrationHash } from '../utils/capturedImageStore.js';

const STEPS = ['Photo key', 'Face scan', 'Authenticator'];

export default function LoginPage() {
  const navigate      = useNavigate();
  const [searchParams] = useSearchParams();
  const { login }     = useAuth();

  const [step, setStep]         = useState(0);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [partialToken, setPartialToken] = useState('');

  // Step 0
  const [username, setUsername]     = useState('');
  const [imageHash, setImageHash]   = useState('');
  const [autoHash, setAutoHash]     = useState(''); // loaded from localStorage
  const [hashSource, setHashSource] = useState(''); // 'auto' | 'upload'

  // Step 2
  const [totpCode, setTotpCode] = useState('');

  const clearError = () => setError('');

  // When username changes, try to load their saved hash from this device
  useEffect(() => {
    if (!username) { setAutoHash(''); setHashSource(''); return; }
    const saved = loadRegistrationHash(username);
    if (saved) {
      setAutoHash(saved);
      setImageHash(saved);
      setHashSource('auto');
    } else {
      setAutoHash('');
      setHashSource('');
      setImageHash('');
    }
  }, [username]);

  // ── Step 0: verify image ─────────────────────────────────
  async function handleImageVerify(e) {
    e.preventDefault();
    clearError();
    if (!username) return setError('Enter your username.');
    if (!imageHash) return setError('No photo key found — please upload your registration photo.');

    setLoading(true);
    try {
      const data = await api.loginVerifyImage(username, imageHash);
      setPartialToken(data.partialToken);
      setStep(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 1: face ─────────────────────────────────────────
  async function handleFaceCaptured(descriptor) {
    clearError();
    setLoading(true);
    try {
      const data = await api.loginVerifyFace(descriptor, partialToken);
      setPartialToken(data.partialToken);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: TOTP ─────────────────────────────────────────
  async function handleTotpVerify(e) {
    e.preventDefault();
    clearError();
    if (!totpCode || totpCode.length !== 6) return setError('Enter the 6-digit code.');
    setLoading(true);
    try {
      const data = await api.loginVerifyTotp(totpCode, partialToken);
      login(data.sessionToken, data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Déjà View</h1>
          <p className="auth-subtitle">Three-factor secure login</p>
        </div>

        {searchParams.get('registered') && (
          <Alert type="success" message="Account created! Sign in with your three factors." />
        )}

        <StepIndicator steps={STEPS} current={step} />
        <Alert type="error" message={error} onClose={clearError} />

        {/* ── STEP 0: username + photo key ── */}
        {step === 0 && (
          <form onSubmit={handleImageVerify} className="auth-form">
            <div className="form-group">
              <label>Username</label>
              <input type="text" value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="your_username" autoComplete="username" autoFocus />
            </div>

            <div className="form-divider"><span>Factor 1 — Photo key</span></div>

            {/* Auto-loaded from this device */}
            {hashSource === 'auto' && (
              <div className="photo-key-auto">
                <span className="photo-key-icon">🔑</span>
                <div className="photo-key-info">
                  <strong>Secret photo found on this device</strong>
                  <span>Your registration photo is ready to use</span>
                </div>
                <span className="badge badge-success">Ready</span>
              </div>
            )}

            {/* Not on this device — must upload the saved photo */}
            {username && !autoHash && (
              <div className="auth-form">
                <p className="step-description">
                  No saved photo found on this device.<br/>
                  Upload your original registration photo file.
                </p>
                <ImagePicker
                  onHash={(h) => { setImageHash(h); setHashSource('upload'); }}
                  onError={setError}
                  label="Upload your registration photo"
                />
              </div>
            )}

            {!username && (
              <p className="muted" style={{fontSize:'0.8rem', textAlign:'center'}}>
                Enter your username to load your photo key
              </p>
            )}

            <button type="submit" className="btn btn-primary btn-full"
              disabled={loading || !imageHash || !username}>
              {loading ? 'Verifying…' : 'Verify photo →'}
            </button>

            <p className="auth-switch">No account? <Link to="/register">Create one</Link></p>
          </form>
        )}

        {/* ── STEP 1: face ── */}
        {step === 1 && (
          <div className="auth-form">
            <p className="step-description">
              <strong>Factor 2 — Face verification</strong><br />
              Look at the camera to verify your identity.
            </p>
            <WebcamCapture onCapture={handleFaceCaptured} onError={setError} />
            {loading && <p className="loading-text">Checking face…</p>}
          </div>
        )}

        {/* ── STEP 2: TOTP ── */}
        {step === 2 && (
          <form onSubmit={handleTotpVerify} className="auth-form">
            <p className="step-description">
              <strong>Factor 3 — Authenticator code</strong><br />
              Open your authenticator app and enter the 6-digit code.
            </p>
            <div className="form-group">
              <label>One-time code</label>
              <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000" className="totp-input" autoComplete="one-time-code" autoFocus />
            </div>
            <button type="submit" className="btn btn-primary btn-full"
              disabled={loading || totpCode.length !== 6}>
              {loading ? 'Verifying…' : 'Sign in →'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

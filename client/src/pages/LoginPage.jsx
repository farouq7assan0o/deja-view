import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import StepIndicator from '../components/StepIndicator.jsx';
import ImagePicker from '../components/ImagePicker.jsx';
import WebcamCapture from '../components/WebcamCapture.jsx';
import Alert from '../components/Alert.jsx';
import { api } from '../utils/api.js';
import { useAuth } from '../hooks/useAuth.jsx';

const STEPS = ['Image key', 'Face scan', 'Authenticator'];

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [partialToken, setPartialToken] = useState('');

  // Step 0
  const [username, setUsername] = useState('');
  const [imageHash, setImageHash] = useState('');

  // Step 2
  const [totpCode, setTotpCode] = useState('');

  const clearError = () => setError('');

  useEffect(() => {
    if (searchParams.get('registered')) {
      setError(''); // clear any errors, show success hint handled below
    }
  }, [searchParams]);

  // ── STEP 0: username + image hash ─────────────────────────
  async function handleImageVerify(e) {
    e.preventDefault();
    clearError();

    if (!username) return setError('Enter your username.');
    if (!imageHash) return setError('Select your secret image.');

    setLoading(true);
    try {
      const data = await api.loginVerifyImage(username, imageHash);
      setPartialToken(data.partialToken);
      setStep(1); // go to face scan
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── STEP 1: face capture ──────────────────────────────────
  async function handleFaceCaptured(descriptor) {
    clearError();
    setLoading(true);
    try {
      const data = await api.loginVerifyFace(descriptor, partialToken);
      setPartialToken(data.partialToken);
      setStep(2); // go to TOTP
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── STEP 2: TOTP ──────────────────────────────────────────
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

        {/* ── STEP 0: Username + Image ── */}
        {step === 0 && (
          <form onSubmit={handleImageVerify} className="auth-form">
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="your_username"
                autoComplete="username"
                autoFocus
              />
            </div>

            <div className="form-divider">
              <span>Factor 1 — Secret image</span>
            </div>

            <ImagePicker
              onHash={setImageHash}
              onError={setError}
              label="Select your secret image"
            />

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading || !imageHash || !username}
            >
              {loading ? 'Verifying…' : 'Verify image →'}
            </button>

            <p className="auth-switch">
              No account? <Link to="/register">Create one</Link>
            </p>
          </form>
        )}

        {/* ── STEP 1: Face scan ── */}
        {step === 1 && (
          <div className="auth-form">
            <p className="step-description">
              <strong>Factor 2 — Face verification</strong><br />
              Look at the camera to verify your identity.
            </p>

            <WebcamCapture
              onCapture={handleFaceCaptured}
              onError={setError}
            />

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
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="totp-input"
                autoComplete="one-time-code"
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading || totpCode.length !== 6}
            >
              {loading ? 'Verifying…' : 'Sign in →'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

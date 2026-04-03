import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import StepIndicator from '../components/StepIndicator.jsx';
import ImageKey from '../components/ImageKey.jsx';
import WebcamCapture from '../components/WebcamCapture.jsx';
import Alert from '../components/Alert.jsx';
import { api } from '../utils/api.js';
import { saveRegistrationPhoto, saveRegistrationHash } from '../utils/capturedImageStore.js';

const STEPS = ['Account', 'Live Photo', 'Face Scan', 'Authenticator'];

export default function RegisterPage() {
  const navigate = useNavigate();

  const [step, setStep]     = useState(0);
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  // Step 0
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');

  // Step 1 — live photo
  const [imageHash, setImageHash]       = useState('');
  const [imagePreview, setImagePreview] = useState('');

  // Step 2 — face
  const [faceDescriptor, setFaceDescriptor] = useState(null);

  // Step 3 — TOTP
  const [userId, setUserId]     = useState(null);
  const [totpQr, setTotpQr]     = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const clearError = () => setError('');

  // ── Step 0: credentials ──────────────────────────────────
  async function handleCredentials(e) {
    e.preventDefault();
    clearError();
    if (!username || !password || !confirm) return setError('All fields are required.');
    if (password !== confirm) return setError('Passwords do not match.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (!imageHash) return setError('Please take your secret photo first.');

    setLoading(true);
    try {
      const data = await api.registerInit(username, password, imageHash);
      setUserId(data.userId);
      setTotpQr(data.totp.qrCode);
      setTotpSecret(data.totp.secret);

      // Save hash + photo locally so login can use them automatically
      saveRegistrationHash(username, imageHash);
      if (imagePreview) saveRegistrationPhoto(username, imagePreview);

      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: face captured ───────────────────────────────
  async function handleFaceCaptured(descriptor) {
    clearError();
    setFaceDescriptor(descriptor);
    setLoading(true);
    try {
      await api.registerSaveFace(userId, descriptor);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: TOTP verify ─────────────────────────────────
  async function handleTotpVerify(e) {
    e.preventDefault();
    clearError();
    if (!totpCode || totpCode.length !== 6) return setError('Enter the 6-digit code from your app.');
    setLoading(true);
    try {
      await api.registerVerifyTotp(userId, totpCode);
      navigate('/login?registered=1');
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
          <h1 className="auth-title">Create account</h1>
          <p className="auth-subtitle">Set up your three-factor protection</p>
        </div>

        <StepIndicator steps={STEPS} current={step} />
        <Alert type="error" message={error} onClose={clearError} />

        {/* ── STEP 0: credentials + live photo ── */}
        {step === 0 && (
          <form onSubmit={handleCredentials} className="auth-form">
            <div className="form-group">
              <label>Username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="your_username" autoComplete="username" minLength={3} maxLength={32} />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters" autoComplete="new-password" />
            </div>
            <div className="form-group">
              <label>Confirm password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat password" autoComplete="new-password" />
            </div>

            <div className="form-divider"><span>Factor 1 — Live secret photo</span></div>

            <ImageKey
              onHash={(h, dataUrl) => { setImageHash(h || ''); setImagePreview(dataUrl || ''); }}
              onError={setError}
            />

            <button type="submit" className="btn btn-primary btn-full"
              disabled={loading || !imageHash}>
              {loading ? 'Creating account…' : 'Continue →'}
            </button>

            <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
          </form>
        )}

        {/* ── STEP 2: face scan ── */}
        {step === 2 && (
          <div className="auth-form">
            <p className="step-description">
              <strong>Factor 2 — Face biometric</strong><br />
              Look directly at the camera. Your face data never leaves this device.
            </p>
            <WebcamCapture onCapture={handleFaceCaptured} onError={setError} />
            {loading && <p className="loading-text">Saving face template…</p>}
          </div>
        )}

        {/* ── STEP 3: TOTP ── */}
        {step === 3 && (
          <form onSubmit={handleTotpVerify} className="auth-form">
            <p className="step-description">
              <strong>Factor 3 — Authenticator app</strong><br />
              Scan this QR code with Google Authenticator, Authy, or any TOTP app.
            </p>
            {totpQr && (
              <div className="totp-qr-wrap">
                <img src={totpQr} alt="TOTP QR code" className="totp-qr" />
              </div>
            )}
            <details className="totp-manual">
              <summary>Can't scan? Enter key manually</summary>
              <code className="totp-secret">{totpSecret}</code>
            </details>
            <div className="form-group">
              <label>Enter the 6-digit code from your app</label>
              <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000" className="totp-input" autoComplete="one-time-code" />
            </div>
            <button type="submit" className="btn btn-primary btn-full"
              disabled={loading || totpCode.length !== 6}>
              {loading ? 'Verifying…' : 'Complete registration →'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import StepIndicator from '../components/StepIndicator.jsx';
import ImageCapture from '../components/ImageCapture.jsx';
import ImagePicker from '../components/ImagePicker.jsx';
import WebcamCapture from '../components/WebcamCapture.jsx';
import Alert from '../components/Alert.jsx';
import { api } from '../utils/api.js';
import { saveRegistrationPhoto, saveRegistrationHash } from '../utils/capturedImageStore.js';

const STEPS = ['Account', 'Face Scan', 'Authenticator', 'Passkey'];

export default function RegisterPage() {
  const navigate = useNavigate();

  const [step, setStep]     = useState(0);
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  // Step 0
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');

  // Step 0 — photo
  const [photoMode, setPhotoMode] = useState('upload'); // 'upload' | 'live'
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
    if (!imageHash) return setError('Please upload or take your secret photo first.');

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
      // Show optional passkey step if browser supports it
      if (browserSupportsWebAuthn()) {
        setStep(4);
      } else {
        navigate('/login?registered=1');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 4: Optional passkey registration ──────────────
  async function handlePasskeySetup() {
    clearError();
    setLoading(true);
    try {
      const { options } = await api.passkeyRegisterOptions(userId);
      const credential = await startRegistration({ optionsJSON: options });
      await api.passkeyRegisterVerify(userId, credential);
      navigate('/login?registered=1');
    } catch (err) {
      // User cancelled or device doesn't support it — that's fine
      if (err.name === 'NotAllowedError') {
        setError('Passkey setup was cancelled. You can set it up later.');
      } else {
        setError(err.message);
      }
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

            <div className="form-divider"><span>Factor 1 — Secret photo</span></div>

            <div className="biometric-toggle" style={{marginBottom:'0.75rem'}}>
              <button type="button"
                className={`toggle-btn ${photoMode === 'upload' ? 'active' : ''}`}
                onClick={() => { setPhotoMode('upload'); setImageHash(''); setImagePreview(''); }}>
                Upload from device
              </button>
              <button type="button"
                className={`toggle-btn ${photoMode === 'live' ? 'active' : ''}`}
                onClick={() => { setPhotoMode('live'); setImageHash(''); setImagePreview(''); }}>
                Take live photo
              </button>
            </div>

            {photoMode === 'upload' ? (
              <ImagePicker
                onHash={(h, file) => { setImageHash(h || ''); setImagePreview(''); }}
                onError={setError}
                label="Choose your secret image"
              />
            ) : (
              <ImageCapture
                onHash={(h, dataUrl) => { setImageHash(h || ''); setImagePreview(dataUrl || ''); }}
                onError={setError}
              />
            )}

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
              {loading ? 'Verifying…' : 'Continue →'}
            </button>
          </form>
        )}

        {/* ── STEP 4: Optional passkey ── */}
        {step === 4 && (
          <div className="auth-form">
            <p className="step-description">
              <strong>Optional — Phone passkey</strong><br />
              Set up Face ID, Touch ID, or fingerprint on your phone so you can skip the webcam face scan when logging in.
            </p>
            <div className="passkey-promo">
              <span className="passkey-icon">📱</span>
              <div className="passkey-info">
                <strong>Use your phone's biometric</strong>
                <span>Face ID, fingerprint, or screen lock</span>
              </div>
            </div>
            <button className="btn btn-primary btn-full"
              onClick={handlePasskeySetup} disabled={loading}>
              {loading ? 'Setting up…' : 'Set up passkey'}
            </button>
            <button className="btn btn-ghost btn-full"
              onClick={() => navigate('/login?registered=1')} disabled={loading}>
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

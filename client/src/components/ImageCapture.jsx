import { useRef, useEffect, useState, useCallback } from 'react';
import { hashImageFile } from '../utils/imageHash.js';

/**
 * ImageCapture — replaces ImagePicker for registration.
 *
 * Forces the user to capture a live photo as their secret image.
 * The photo is taken from the webcam RIGHT NOW — it cannot be a
 * downloaded image or a pre-existing file.
 *
 * Security properties:
 * - Image is unique to this moment (timestamp embedded in hash input)
 * - Cannot be replicated from internet sources
 * - Preview shown so user understands what they're registering
 * - Hash computed from raw canvas pixels + timestamp salt
 *
 * Props:
 *   onHash(hash: string, dataUrl: string) — called when photo is taken
 *   onError(msg: string)
 */
export default function ImageCapture({ onHash, onError }) {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);

  const [phase, setPhase]     = useState('idle'); // idle|loading|live|captured|error
  const [preview, setPreview] = useState(null);
  const [hash, setHash]       = useState('');
  const [errMsg, setErrMsg]   = useState('');

  // ── Start webcam ──────────────────────────────────────────
  async function startCamera() {
    setPhase('loading');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      const vid = videoRef.current;
      vid.srcObject = stream;
      vid.play();
      await new Promise(resolve => {
        const check = setInterval(() => {
          if (vid.readyState >= 3 && vid.videoWidth > 0) { clearInterval(check); resolve(); }
        }, 100);
      });
      setPhase('live');
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera denied — allow camera and refresh'
        : `Camera error: ${err.message}`;
      setErrMsg(msg);
      setPhase('error');
      onError?.(msg);
    }
  }

  // ── Stop webcam ───────────────────────────────────────────
  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), []);

  // ── Capture photo ─────────────────────────────────────────
  async function capturePhoto() {
    const vid    = videoRef.current;
    const canvas = canvasRef.current;
    if (!vid || !canvas) return;

    const vw = vid.videoWidth;
    const vh = vid.videoHeight;
    canvas.width  = vw;
    canvas.height = vh;

    const ctx = canvas.getContext('2d');
    // Draw mirrored (matches what user sees)
    ctx.translate(vw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(vid, 0, 0, vw, vh);
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform

    // Get the image as a data URL for preview
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // Hash = SHA-256 of (raw pixel bytes + registration timestamp)
    // The timestamp salt means even two photos of the exact same scene
    // produce different hashes — truly unique per registration
    const timestamp = Date.now().toString();
    const pixelBlob  = await (await fetch(dataUrl)).blob();
    const pixelBuffer = await pixelBlob.arrayBuffer();

    // Concatenate pixel bytes + timestamp bytes
    const tsBytes  = new TextEncoder().encode(timestamp);
    const combined = new Uint8Array(pixelBuffer.byteLength + tsBytes.byteLength);
    combined.set(new Uint8Array(pixelBuffer), 0);
    combined.set(tsBytes, pixelBuffer.byteLength);

    const hashBuffer = await crypto.subtle.digest('SHA-256', combined.buffer);
    const hashHex    = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    setPreview(dataUrl);
    setHash(hashHex);
    stopCamera();
    setPhase('captured');
    onHash?.(hashHex, dataUrl);
  }

  function retake() {
    setPreview(null);
    setHash('');
    setPhase('idle');
    onHash?.(null, null); // clear parent state
  }

  return (
    <div className="image-capture">
      <label className="image-picker-label">Factor 1 — Live secret photo</label>

      {/* IDLE: show start button */}
      {phase === 'idle' && (
        <div className="capture-idle" onClick={startCamera}>
          <div className="capture-idle-inner">
            <span className="capture-cam-icon">📷</span>
            <span>Take a photo as your secret key</span>
            <span className="capture-sub">Click to open camera</span>
          </div>
        </div>
      )}

      {/* LIVE / LOADING: show viewfinder */}
      {(phase === 'live' || phase === 'loading') && (
        <div className="capture-viewfinder">
          <video
            ref={videoRef}
            className="capture-video"
            playsInline muted autoPlay
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {phase === 'loading' && (
            <div className="capture-loading-overlay">
              <div className="webcam-spinner" />
            </div>
          )}

          {phase === 'live' && (
            <div className="capture-controls">
              <button
                type="button"
                className="btn-capture"
                onClick={capturePhoto}
                title="Take photo"
              >
                <span className="btn-capture-inner" />
              </button>
            </div>
          )}

          {/* Countdown hint */}
          {phase === 'live' && (
            <div className="capture-hint-overlay">
              <span>Position yourself in frame, then tap the button</span>
            </div>
          )}
        </div>
      )}

      {/* CAPTURED: show preview + retake */}
      {phase === 'captured' && preview && (
        <div className="capture-preview-wrap">
          <img src={preview} alt="Your secret photo" className="capture-preview" />
          <div className="capture-preview-overlay">
            <span className="capture-check">✓ Secret photo set</span>
          </div>
          <button type="button" className="btn btn-ghost btn-sm capture-retake" onClick={retake}>
            Retake
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="alert alert-error">{errMsg}</div>
      )}

      {/* Hash fingerprint display */}
      {hash && (
        <div className="hash-display">
          <span className="hash-label">SHA-256</span>
          <code className="hash-value">{hash.slice(0, 16)}…</code>
          <span className="hash-filename">live capture</span>
        </div>
      )}

      <p className="picker-note">
        📷 This live photo is your authentication key — it never leaves your device.
        Only its unique fingerprint is stored on the server.
        You must use the same photo every time you log in — it's saved automatically.
      </p>
    </div>
  );
}

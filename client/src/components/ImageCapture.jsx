import { useRef, useEffect, useState } from 'react';

/**
 * ImageCapture — live webcam photo as the secret image key.
 *
 * HASH DESIGN (fixed):
 * - Hash = SHA-256(raw pixel bytes ONLY) — no timestamp
 * - Timestamp was removed because it made registration hash ≠ login hash
 * - SHA-256 already guarantees uniqueness: 1 pixel different = completely different hash
 * - The hash is stored in localStorage so login on the same device is seamless
 *
 * SECURITY NOTE:
 * The raw hash is never sent directly to the server during login.
 * Instead, the server issues a nonce first, and the client sends:
 *   SHA-256(imageHash + nonce)
 * This means intercepting the network gives an attacker a single-use value
 * that is mathematically useless without the original image.
 */
export default function ImageCapture({ onHash, onError }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [phase, setPhase]     = useState('idle');
  const [preview, setPreview] = useState(null);
  const [hash, setHash]       = useState('');
  const [errMsg, setErrMsg]   = useState('');

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

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  useEffect(() => () => stopCamera(), []);

  async function capturePhoto() {
    const vid    = videoRef.current;
    const canvas = canvasRef.current;
    if (!vid || !canvas) return;

    const vw = vid.videoWidth;
    const vh = vid.videoHeight;
    canvas.width  = vw;
    canvas.height = vh;

    const ctx = canvas.getContext('2d');
    ctx.translate(vw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(vid, 0, 0, vw, vh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // Hash = SHA-256(pixels only) — NO timestamp
    // SHA-256 already guarantees: same image → same hash, 1 pixel different → completely different hash
    const pixelBlob   = await (await fetch(dataUrl)).blob();
    const pixelBuffer = await pixelBlob.arrayBuffer();
    const hashBuffer  = await crypto.subtle.digest('SHA-256', pixelBuffer);
    const hashHex     = Array.from(new Uint8Array(hashBuffer))
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
    onHash?.(null, null);
  }

  return (
    <div className="image-capture">
      <label className="image-picker-label">Factor 1 — Live secret photo</label>

      {phase === 'idle' && (
        <div className="capture-idle" onClick={startCamera}>
          <div className="capture-idle-inner">
            <span className="capture-cam-icon">📷</span>
            <span>Take a photo as your secret key</span>
            <span className="capture-sub">Click to open camera</span>
          </div>
        </div>
      )}

      {(phase === 'live' || phase === 'loading') && (
        <div className="capture-viewfinder">
          <video ref={videoRef} className="capture-video" playsInline muted autoPlay />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {phase === 'loading' && (
            <div className="capture-loading-overlay"><div className="webcam-spinner" /></div>
          )}
          {phase === 'live' && (
            <>
              <div className="capture-controls">
                <button type="button" className="btn-capture" onClick={capturePhoto}>
                  <span className="btn-capture-inner" />
                </button>
              </div>
              <div className="capture-hint-overlay">
                <span>Position yourself in frame, then tap the button</span>
              </div>
            </>
          )}
        </div>
      )}

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

      {phase === 'error' && <div className="alert alert-error">{errMsg}</div>}

      {hash && (
        <div className="hash-display">
          <span className="hash-label">SHA-256</span>
          <code className="hash-value">{hash.slice(0, 16)}…</code>
          <span className="hash-filename">live capture</span>
        </div>
      )}

      <p className="picker-note">
        This live photo is your authentication key — only its fingerprint is stored on the server.
        The photo itself never leaves your device. Save it — you will need it to log in.
      </p>
    </div>
  );
}

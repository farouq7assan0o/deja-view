import { useRef, useEffect, useState } from 'react';
import { hashImageFile, validateImageFile } from '../utils/imageHash.js';

/**
 * ImageKey — unified secret image factor component.
 *
 * Two modes the user can switch between:
 *   "live"   — take a photo right now with the webcam
 *   "upload" — choose an existing image file from device
 *
 * Both compute the same SHA-256 hash of pixel bytes only (no timestamp).
 * The hash is what gets stored on the server and used for login.
 *
 * Props:
 *   onHash(hash: string, dataUrl: string) — called when image is ready
 *   onError(msg: string)
 */
export default function ImageKey({ onHash, onError }) {
  const [mode, setMode] = useState('live'); // 'live' | 'upload'

  function handleHash(hash, dataUrl) {
    onHash?.(hash, dataUrl);
  }

  function switchMode(m) {
    setMode(m);
    onHash?.(null, null); // clear parent state when switching
  }

  return (
    <div className="image-key-wrap">
      {/* Mode toggle */}
      <div className="image-key-tabs">
        <button
          type="button"
          className={`image-key-tab ${mode === 'live' ? 'active' : ''}`}
          onClick={() => switchMode('live')}
        >
          Take photo now
        </button>
        <button
          type="button"
          className={`image-key-tab ${mode === 'upload' ? 'active' : ''}`}
          onClick={() => switchMode('upload')}
        >
          Choose from device
        </button>
      </div>

      {mode === 'live'   && <LiveCapture   onHash={handleHash} onError={onError} />}
      {mode === 'upload' && <FileUpload    onHash={handleHash} onError={onError} />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Live capture sub-component
───────────────────────────────────────────── */
function LiveCapture({ onHash, onError }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [phase, setPhase]     = useState('idle'); // idle|loading|live|captured|error
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

  // Stop camera when component unmounts or mode switches
  useEffect(() => () => stopCamera(), []);

  async function capturePhoto() {
    const vid    = videoRef.current;
    const canvas = canvasRef.current;
    if (!vid || !canvas) return;

    canvas.width  = vid.videoWidth;
    canvas.height = vid.videoHeight;
    const ctx = canvas.getContext('2d');
    // Mirror to match what user sees
    ctx.translate(vid.videoWidth, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(vid, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // SHA-256 of raw pixel bytes — no timestamp
    const blob    = await (await fetch(dataUrl)).blob();
    const buffer  = await blob.arrayBuffer();
    const digest  = await crypto.subtle.digest('SHA-256', buffer);
    const hashHex = Array.from(new Uint8Array(digest))
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
    <div>
      {phase === 'idle' && (
        <div className="capture-idle" onClick={startCamera}>
          <div className="capture-idle-inner">
            <span className="capture-cam-icon">📷</span>
            <span>Open camera to take your secret photo</span>
            <span className="capture-sub">Click to start</span>
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
                <span>Position yourself then tap to capture</span>
              </div>
            </>
          )}
        </div>
      )}

      {phase === 'captured' && preview && (
        <div className="capture-preview-wrap">
          <img src={preview} alt="Secret photo" className="capture-preview" />
          <div className="capture-preview-overlay">
            <span className="capture-check">✓ Photo captured</span>
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

      {phase !== 'error' && (
        <p className="picker-note">
          This live photo becomes your secret key. It never leaves your device — only its
          fingerprint is stored. Save or remember this photo; you will need it to log in.
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   File upload sub-component
───────────────────────────────────────────── */
function FileUpload({ onHash, onError }) {
  const [preview,  setPreview]  = useState(null);
  const [hash,     setHash]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [fileName, setFileName] = useState('');

  async function handleFile(file) {
    if (!file) return;

    const err = validateImageFile(file);
    if (err) { onError?.(err); return; }

    setLoading(true);
    setFileName(file.name);
    try {
      // Preview
      const reader = new FileReader();
      reader.onload = e => setPreview(e.target.result);
      reader.readAsDataURL(file);

      // Hash the file's raw bytes — same SHA-256, no timestamp
      const h = await hashImageFile(file);
      setHash(h);
      // Convert to dataUrl for consistent storage
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = e => res(e.target.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      onHash?.(h, dataUrl);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setPreview(null);
    setHash('');
    setFileName('');
    onHash?.(null, null);
  }

  return (
    <div className="image-picker">
      <div
        className={`drop-zone ${preview ? 'has-preview' : ''}`}
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
        onDragOver={e => e.preventDefault()}
        onClick={() => document.getElementById('ik-file-input').click()}
      >
        {preview ? (
          <img src={preview} alt="Selected image" className="preview-img" />
        ) : (
          <div className="drop-hint">
            <span className="drop-icon">🖼</span>
            <span>Drop image here or click to browse</span>
            <span className="drop-sub">JPEG, PNG, WebP — up to 10 MB</span>
          </div>
        )}
      </div>

      <input
        id="ik-file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={e => handleFile(e.target.files?.[0])}
        style={{ display: 'none' }}
      />

      {loading && <p className="picker-status">Computing fingerprint…</p>}

      {hash && !loading && (
        <div className="hash-display" style={{cursor:'pointer'}} onClick={clear}>
          <span className="hash-label">SHA-256</span>
          <code className="hash-value">{hash.slice(0, 16)}…</code>
          <span className="hash-filename">{fileName}</span>
          <span style={{marginLeft:'auto', fontSize:'0.75rem', color:'var(--text-muted)'}}>✕ change</span>
        </div>
      )}

      <p className="picker-note">
        This image is your secret key. The file is never uploaded — only its fingerprint
        is stored. Use the same image every time you log in.
      </p>
    </div>
  );
}

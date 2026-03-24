import { useRef, useEffect, useState } from 'react';
import { loadFaceModels, faceapi } from '../utils/faceDetection.js';

/**
 * Liveness: require the user to be looking at the camera.
 * 
 * How we detect "looking at camera" with face-api.js landmarks:
 * - Get the 68-point landmark positions
 * - Measure horizontal eye symmetry: both eyes should be visible and roughly equal width
 * - Measure nose-to-eye-center alignment: nose tip should be between the eyes horizontally
 * - If these pass → user is facing forward (not profile, not looking away)
 * 
 * This is the correct approach for @vladmandic/face-api which returns
 * the detection object directly (not wrapped in .detection)
 */
export default function WebcamCapture({ onCapture, onError }) {
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);
  const loopRef    = useRef(null);
  const doneRef    = useRef(false);
  const ticksRef   = useRef(0); // consecutive frames where face is forward-facing
const blinkStateRef = useRef({ wasOpen: false });
const headMoveTicksRef = useRef(0);
  const [phase, setPhase]   = useState('init');
  const modelsReadyRef = useRef(false);
  const [ticks, setTicks]   = useState(0);
  const [hint, setHint]     = useState('');
  const [errMsg, setErrMsg] = useState('');

  const CONFIRM_TICKS = 10;   // 10 × 200ms = 2s of confirmed forward-facing
  const SCORE_THRESH  = 0.3;
  // Eye symmetry: ratio of left-eye-width to right-eye-width must be close to 1
  // If you're looking away, one eye appears much narrower
  const EYE_SYMMETRY_MIN = 0.8; // allow some tilt but reject full profile
  // Nose must be between eyes horizontally (not outside them = profile)
  const NOSE_IN_EYES = true;

  // ── Boot ──────────────────────────────────────────────────
  useEffect(() => {
    let dead = false;
    async function boot() {
      setPhase('loading');
      setHint('Loading face models…');
      try {
        await loadFaceModels();
        modelsReadyRef.current = true;
        if (dead) return;
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (dead) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const vid = videoRef.current;
        vid.srcObject = stream;
        vid.play();
        await new Promise(resolve => {
          const check = setInterval(() => {
            if (vid.readyState >= 3 && vid.videoWidth > 0) { clearInterval(check); resolve(); }
          }, 100);
        });
        setPhase('scanning');
        setHint('Look at the camera');
      } catch (err) {
        if (dead) return;
        const msg = err.name === 'NotAllowedError'
          ? 'Camera denied — allow camera and refresh'
          : `Camera error: ${err.message}`;
        setErrMsg(msg);
        setPhase('error');
        onError?.(msg);
      }
    }
    boot();
    return () => {
      dead = true;
      clearInterval(loopRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Detection loop ────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'scanning') return;
    const vid = videoRef.current;
    if (!vid) return;

    async function tick() {
      if (doneRef.current) return;
      if (vid.readyState < 2 || !vid.videoWidth) return;

      try {
        const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: SCORE_THRESH });

        // With @vladmandic/face-api we chain withFaceLandmarks always —
        // we need landmarks to check gaze direction
        const result = await faceapi
          .detectSingleFace(vid, opts)
          .withFaceLandmarks();

          if (result.detection.score < 0.85) {
  ticksRef.current = 0;
  setTicks(0);
  setHint('Move closer — face not clear');
  return;
}

        if (!result) {
          ticksRef.current = 0;
          setTicks(0);
          setHint('Look at the camera');
          return;
        }

        // ── Check if facing forward using landmarks ──────────
        const lm = result.landmarks.positions; // 68 points

        // Left eye: points 36-41, Right eye: points 42-47
        const leftEye  = lm.slice(36, 42);
        const rightEye = lm.slice(42, 48);

        const eyeWidth = (pts) => {
          const xs = pts.map(p => p.x);
          return Math.max(...xs) - Math.min(...xs);
        };

        const lw = eyeWidth(leftEye);
        const rw = eyeWidth(rightEye);

        // Symmetry ratio: smaller / larger. 1.0 = perfect symmetry, 0 = one eye invisible
        const symmetry = lw > 0 && rw > 0 ? Math.min(lw, rw) / Math.max(lw, rw) : 0;

        // Nose tip = landmark 30
        const noseTip = lm[30];
        const leftEyeCenterX  = leftEye.reduce((s, p) => s + p.x, 0)  / leftEye.length;
        const rightEyeCenterX = rightEye.reduce((s, p) => s + p.x, 0) / rightEye.length;
        const eyeLeft  = Math.min(leftEyeCenterX, rightEyeCenterX);
        const eyeRight = Math.max(leftEyeCenterX, rightEyeCenterX);
        const noseInEyes = noseTip.x > eyeLeft && noseTip.x < eyeRight;
// ── Extra checks ─────────────────────────

// Minimum eye width (reject if one eye is basically missing)
const MIN_EYE_WIDTH = 8;

// Eye height (detect closed/covered eyes)
const eyeHeight = (pts) => {
  const ys = pts.map(p => p.y);
  return Math.max(...ys) - Math.min(...ys);
};

const lh = eyeHeight(leftEye);
const rh = eyeHeight(rightEye);
  
// Conditions
// stricter eye visibility
const bothEyesVisible =
  lw > 10 &&
  rw > 10 &&
  Math.abs(lw - rw) < 10;

// eye openness
const eyesOpen = lh > 4 && rh > 4;

// symmetry stricter
const symmetryOK = symmetry >= 0.8;

// stronger nose validation
const validNose =
  noseTip.x > eyeLeft &&
  noseTip.x < eyeRight &&
  Math.abs(noseTip.y - leftEye[0].y) < 80;

// FINAL decision
const facingForward =
  symmetryOK &&
  bothEyesVisible &&
  validNose &&
  eyesOpen;

// ── Reject ──────────────────────────────
if (!facingForward) {
  ticksRef.current = 0;
  setTicks(0);

  if (!bothEyesVisible) {
    setHint('Show both eyes');
  } else if (!eyesOpen) {
    setHint('Open your eyes');
  } else if (!symmetryOK) {
    setHint('Face the camera directly');
  } else {
    setHint('Look straight ahead');
  }

  return;
}

        // ── Forward-facing confirmed ─────────────────────────
        ticksRef.current++;
        setTicks(ticksRef.current);

        if (ticksRef.current <= 2) setHint('Hold still…');
        else setHint(`Hold still… (${ticksRef.current}/${CONFIRM_TICKS})`);

        if (ticksRef.current >= CONFIRM_TICKS && !doneRef.current) {
  // ❌ REMOVE direct capture
  // doneRef.current = true;
  // clearInterval(loopRef.current);
  // setPhase('capturing');
  // setHint('Processing…');
  // doCapture(vid);

  // ✅ REPLACE WITH CHALLENGE STEP
  clearInterval(loopRef.current); // stop scanning loop
  blinkStateRef.current.wasOpen = false;
setPhase('challenge');
  setHint('Turn your head slightly');
}

      } catch (err) {
        // Swallow transient errors silently
        console.warn('[webcam tick]', err.message);
      }
    }

    loopRef.current = setInterval(tick, 200);
    return () => clearInterval(loopRef.current);
  }, [phase === 'scanning' ? 'scanning' : '__']);

  useEffect(() => {
  if (phase !== 'challenge') return;

  const vid = videoRef.current;
  if (!vid) return;

  async function detectBlink() {
    if (
  !faceapi.nets.tinyFaceDetector.isLoaded ||
  !faceapi.nets.faceLandmark68Net.isLoaded
) {
  return;
}
    if (vid.readyState < 2) return;

    try {
      let result;

try {
  const opts = new faceapi.TinyFaceDetectorOptions({
  inputSize: 224,
  scoreThreshold: SCORE_THRESH
});

result = await faceapi
  .detectSingleFace(vid, opts)
  .withFaceLandmarks();
} catch (e) {
  // 🔥 swallow model-not-ready error
  return;
}

      if (!result) return;

      

      const lm = result.landmarks.positions;

// nose tip
const nose = lm[30];

// left & right face edges
const leftCheek = lm[2];
const rightCheek = lm[14];

// center of face
const faceCenter = (leftCheek.x + rightCheek.x) / 2;

// how far nose moved from center
const offset = nose.x - faceCenter;
if (!blinkStateRef.current.baseOffset) {
  blinkStateRef.current.baseOffset = offset;
}

// DEBUG
console.log('HEAD OFFSET:', offset);

// detect head turn
if (Math.abs(offset) > 25) {
  headMoveTicksRef.current++;
} else {
  headMoveTicksRef.current = 0;
}

if (headMoveTicksRef.current >= 3) {
  doneRef.current = true;

  setHint('Good — processing…');
  setPhase('capturing');
  doCapture(vid);
}

    } catch (err) {
      console.warn('[blink]', err.message);
    }
  }

  const interval = setInterval(detectBlink, 150);
  return () => clearInterval(interval);

}, [phase]);

  // ── Capture descriptor ─────────────────────────────────────
  async function doCapture(vid) {
    for (const size of [320, 416]) {
      try {
        const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: SCORE_THRESH });
        const d = await faceapi.detectSingleFace(vid, opts).withFaceLandmarks().withFaceDescriptor();
        if (d?.descriptor) {
          setPhase('done');
          setHint('Face captured ✓');
          onCapture?.(Array.from(d.descriptor));
          return;
        }
      } catch (e) {
        console.warn('[doCapture size=' + size + ']', e.message);
      }
    }
    doneRef.current  = false;
    ticksRef.current = 0;
    setTicks(0);
    setPhase('scanning');
    setHint('Look at the camera');
    onError?.('Could not capture face — please try again');
  }

  function retry() {
    doneRef.current  = false;
    ticksRef.current = 0;
    setTicks(0);
    setPhase('scanning');
    setHint('Look at the camera');
  }

  const pct  = Math.min(100, (ticks / CONFIRM_TICKS) * 100);
  const circ = 2 * Math.PI * 54;

  return (
    <div className="webcam-wrap">
      <div className="webcam-outer">
        <svg className="webcam-progress-ring" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" strokeWidth="3"/>
          {pct > 0 && (
            <circle cx="60" cy="60" r="54" fill="none"
              stroke={pct >= 100 ? '#22c55e' : '#3b82f6'}
              strokeWidth="3"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - pct / 100)}
              strokeLinecap="round"
              style={{ transform:'rotate(-90deg)', transformOrigin:'60px 60px', transition:'stroke-dashoffset 0.15s linear' }}
            />
          )}
        </svg>

        <div className={`webcam-frame ${phase==='done'?'success':phase==='error'?'error':ticks>0?'active':''}`}>
          <video ref={videoRef} className="webcam-video" playsInline muted autoPlay />
          {phase === 'done' && (
            <div className="webcam-success-overlay">
              <span className="webcam-checkmark">✓</span>
            </div>
          )}
          {phase === 'loading' && (
            <div className="webcam-loading-overlay">
              <div className="webcam-spinner"/>
            </div>
          )}
        </div>
      </div>

      <p className={`webcam-status ${phase==='error'?'error':phase==='done'?'success':''}`}>
        {phase === 'error' ? errMsg : hint}
      </p>

      {phase === 'done' && (
        <button className="btn btn-ghost btn-sm" onClick={retry}>Retry</button>
      )}
    </div>
  );
}

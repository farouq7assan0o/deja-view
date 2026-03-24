/**
 * Face detection and descriptor extraction using @vladmandic/face-api.
 *
 * Models are loaded from /models (put them in client/public/models/).
 * Download from: https://github.com/vladmandic/face-api/tree/master/model
 * Required files:
 *   - tiny_face_detector_model-weights_manifest.json + shard
 *   - face_landmark_68_model-weights_manifest.json + shard
 *   - face_recognition_model-weights_manifest.json + shard
 */
import * as faceapi from '@vladmandic/face-api';

let modelsLoaded = false;

export async function loadFaceModels() {
  if (modelsLoaded) return;

  const MODEL_URL = '/models';

  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);

  modelsLoaded = true;
  console.log('[face-api] Models loaded.');
}

/**
 * Captures a face descriptor from a <video> element.
 * Returns a plain number[] of length 128, or throws if no face is detected.
 *
 * @param {HTMLVideoElement} videoEl
 * @returns {Promise<number[]>}
 */
export async function getFaceDescriptor(videoEl) {
  await loadFaceModels();

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.5,
  });

  const detection = await faceapi
    .detectSingleFace(videoEl, options)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    throw new Error('No face detected. Make sure your face is clearly visible and well-lit.');
  }

  return Array.from(detection.descriptor); // Float32Array → number[]
}

/**
 * Euclidean distance between two descriptors.
 * < 0.5 is typically a match; > 0.6 is typically a different person.
 */
export function faceDistance(a, b) {
  return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0));
}

export { faceapi };

import {
  FaceLandmarker,
  PoseLandmarker,
  GestureRecognizer,
  FilesetResolver,
  type FaceLandmarkerResult,
  type PoseLandmarkerResult,
  type GestureRecognizerResult,
} from "@mediapipe/tasks-vision";

export interface TrackingResult {
  face: FaceLandmarkerResult | null;
  pose: PoseLandmarkerResult | null;
  hands: HandsResult | null;
  timestamp: number;
}

export interface HandsResult {
  landmarks: GestureRecognizerResult["landmarks"];
  worldLandmarks: GestureRecognizerResult["worldLandmarks"];
  handedness: GestureRecognizerResult["handedness"];
  gestures: GestureRecognizerResult["gestures"];
}

export interface FaceTracker {
  faceLandmarker: FaceLandmarker;
  poseLandmarker: PoseLandmarker;
  gestureRecognizer: GestureRecognizer | null;
  detect: (video: HTMLVideoElement) => TrackingResult;
  dispose: () => void;
}

interface TrackerOptions {
  enableHands?: boolean;
}

export async function createFaceTracker(
  options: TrackerOptions = {},
): Promise<FaceTracker> {
  const base = import.meta.env.BASE_URL;
  const vision = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);

  const delegate = "GPU";

  const faceLandmarkerPromise = FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `${base}mediapipe/models/face_landmarker.task`,
      delegate,
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });

  const poseLandmarkerPromise = PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `${base}mediapipe/models/pose_landmarker_full.task`,
      delegate,
    },
    runningMode: "VIDEO",
    numPoses: 1,
  });

  const gestureRecognizerPromise = options.enableHands
    ? GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `${base}mediapipe/models/gesture_recognizer.task`,
          delegate,
        },
        runningMode: "VIDEO",
        numHands: 2,
      })
    : null;

  const [faceLandmarker, poseLandmarker, gestureRecognizer] = await Promise.all(
    [faceLandmarkerPromise, poseLandmarkerPromise, gestureRecognizerPromise],
  );

  let lastTimestamp = -1;

  return {
    faceLandmarker,
    poseLandmarker,
    gestureRecognizer: gestureRecognizer ?? null,
    detect(video: HTMLVideoElement): TrackingResult {
      const now = performance.now();
      if (now <= lastTimestamp) {
        return { face: null, pose: null, hands: null, timestamp: now };
      }
      lastTimestamp = now;

      let face: FaceLandmarkerResult | null = null;
      let pose: PoseLandmarkerResult | null = null;
      let hands: HandsResult | null = null;

      try {
        face = faceLandmarker.detectForVideo(video, now);
      } catch {
        // skip frame
      }

      try {
        pose = poseLandmarker.detectForVideo(video, now);
      } catch {
        // skip frame
      }

      if (gestureRecognizer) {
        try {
          const result = gestureRecognizer.recognizeForVideo(video, now);
          hands = {
            landmarks: result.landmarks,
            worldLandmarks: result.worldLandmarks,
            handedness: result.handedness,
            gestures: result.gestures,
          };
        } catch {
          // skip frame
        }
      }

      return { face, pose, hands, timestamp: now };
    },
    dispose() {
      faceLandmarker.close();
      poseLandmarker.close();
      gestureRecognizer?.close();
    },
  };
}

export async function setupWebcam(
  videoElement: HTMLVideoElement,
  deviceId?: string,
): Promise<MediaStream> {
  const video: MediaTrackConstraints = deviceId
    ? { width: 640, height: 480, deviceId: { exact: deviceId } }
    : { width: 640, height: 480, facingMode: "user" };
  const stream = await navigator.mediaDevices.getUserMedia({
    video,
    audio: false,
  });
  videoElement.srcObject = stream;
  await videoElement.play();
  return stream;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export async function listCameraDevices(): Promise<CameraDevice[]> {
  // Request permission first (needed to get labels)
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({
      video: true,
    });
    for (const track of tempStream.getTracks()) track.stop();
  } catch {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  console.log({ devices });
  return devices
    .filter((d) => d.kind === "videoinput")
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `カメラ ${i + 1}`,
    }));
}

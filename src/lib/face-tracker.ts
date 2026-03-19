import {
  FaceLandmarker,
  PoseLandmarker,
  HandLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type PoseLandmarkerResult,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

export interface TrackingResult {
  face: FaceLandmarkerResult | null;
  pose: PoseLandmarkerResult | null;
  hands: HandLandmarkerResult | null;
  timestamp: number;
}

export interface FaceTracker {
  faceLandmarker: FaceLandmarker;
  poseLandmarker: PoseLandmarker;
  handLandmarker: HandLandmarker | null;
  detect: (video: HTMLVideoElement) => TrackingResult;
  dispose: () => void;
}

export interface TrackerOptions {
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

  const handLandmarkerPromise = options.enableHands
    ? HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `${base}mediapipe/models/hand_landmarker.task`,
          delegate,
        },
        runningMode: "VIDEO",
        numHands: 2,
      })
    : null;

  const [faceLandmarker, poseLandmarker, handLandmarker] = await Promise.all([
    faceLandmarkerPromise,
    poseLandmarkerPromise,
    handLandmarkerPromise,
  ]);

  let lastTimestamp = -1;

  return {
    faceLandmarker,
    poseLandmarker,
    handLandmarker: handLandmarker ?? null,
    detect(video: HTMLVideoElement): TrackingResult {
      const now = performance.now();
      if (now <= lastTimestamp) {
        return { face: null, pose: null, hands: null, timestamp: now };
      }
      lastTimestamp = now;

      let face: FaceLandmarkerResult | null = null;
      let pose: PoseLandmarkerResult | null = null;
      let hands: HandLandmarkerResult | null = null;

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

      if (handLandmarker) {
        try {
          hands = handLandmarker.detectForVideo(video, now);
        } catch {
          // skip frame
        }
      }

      return { face, pose, hands, timestamp: now };
    },
    dispose() {
      faceLandmarker.close();
      poseLandmarker.close();
      handLandmarker?.close();
    },
  };
}

export async function setupWebcam(
  videoElement: HTMLVideoElement,
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: "user" },
    audio: false,
  });
  videoElement.srcObject = stream;
  await videoElement.play();
  return stream;
}

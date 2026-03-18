import {
  FaceLandmarker,
  PoseLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

export interface TrackingResult {
  face: FaceLandmarkerResult | null;
  pose: PoseLandmarkerResult | null;
  timestamp: number;
}

export interface FaceTracker {
  faceLandmarker: FaceLandmarker;
  poseLandmarker: PoseLandmarker;
  detect: (video: HTMLVideoElement) => TrackingResult;
  dispose: () => void;
}

export async function createFaceTracker(): Promise<FaceTracker> {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm",
  );

  const [faceLandmarker, poseLandmarker] = await Promise.all([
    FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    }),
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    }),
  ]);

  let lastTimestamp = -1;

  return {
    faceLandmarker,
    poseLandmarker,
    detect(video: HTMLVideoElement): TrackingResult {
      const now = performance.now();
      // MediaPipe requires strictly increasing timestamps
      if (now <= lastTimestamp) {
        return { face: null, pose: null, timestamp: now };
      }
      lastTimestamp = now;

      let face: FaceLandmarkerResult | null = null;
      let pose: PoseLandmarkerResult | null = null;

      try {
        face = faceLandmarker.detectForVideo(video, now);
      } catch {
        // skip frame on error
      }

      try {
        pose = poseLandmarker.detectForVideo(video, now);
      } catch {
        // skip frame on error
      }

      return { face, pose, timestamp: now };
    },
    dispose() {
      faceLandmarker.close();
      poseLandmarker.close();
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

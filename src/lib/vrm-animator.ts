import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import * as THREE from "three";
import type { TrackingResult } from "./face-tracker";
import { solveArm, solveShoulder, solveSpine, resetShoulderCalibration } from "./arm-solver";
import { solveHand, type HandSolveResult } from "./finger-solver";

/**
 * Maps MediaPipe tracking results to VRM bone rotations and expressions.
 * Inspired by Kalidokit but simplified for our use case.
 */

const euler = new THREE.Euler();
const quat = new THREE.Quaternion();

// Lerp factor for smooth animation (lower = smoother but more latency)
const LERP_FACTOR = 0.08;
const LERP_FACTOR_SLOW = 0.04;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Previous values for smoothing
const prev = {
  headRotX: 0,
  headRotY: 0,
  headRotZ: 0,
  spineRotX: 0,
  spineRotY: 0,
  leftUpperArmZ: 0.3,
  rightUpperArmZ: -0.3,
};

export function resetAnimatorState(): void {
  prev.headRotX = 0;
  prev.headRotY = 0;
  prev.headRotZ = 0;
  prev.spineRotX = 0;
  prev.spineRotY = 0;
  prevArm.leftUpperZ = REST_UPPER_Z_LEFT;
  prevArm.leftUpperX = 0;
  prevArm.leftUpperY = 0;
  prevArm.leftLowerY = REST_LOWER_Y_LEFT;
  prevArm.rightUpperZ = REST_UPPER_Z_RIGHT;
  prevArm.rightUpperX = 0;
  prevArm.rightUpperY = 0;
  prevArm.rightLowerY = REST_LOWER_Y_RIGHT;
  for (const key of Object.keys(prevFingers)) delete prevFingers[key];
  for (const key of Object.keys(prevHandRot)) delete prevHandRot[key];
  resetShoulderCalibration();
}

export function applyTracking(vrm: VRM, result: TrackingResult): void {
  applyFaceTracking(vrm, result);
  applyPoseTracking(vrm, result);
  applyHandTracking(vrm, result);
}

function applyFaceTracking(vrm: VRM, result: TrackingResult): void {
  const { face } = result;
  if (!face?.faceLandmarks?.length) return;

  const landmarks = face.faceLandmarks[0];
  const blendshapes = face.faceBlendshapes?.[0]?.categories;
  const matrix = face.facialTransformationMatrixes?.[0];

  // Apply head rotation from transformation matrix
  // MediaPipe coord: X-right, Y-down, Z-away from camera
  // VRM coord: X-right, Y-up, Z-toward camera
  // So: pitch needs negation (Y flipped), yaw needs negation (mirrored webcam),
  // roll needs negation
  const headBone = vrm.humanoid.getNormalizedBoneNode("head");
  if (headBone && matrix) {
    const m = new THREE.Matrix4().fromArray(matrix.data);
    const rot = new THREE.Euler().setFromRotationMatrix(m);

    // Convert from MediaPipe to VRM coordinate space
    const pitch = clamp(-rot.x * 0.8, -0.5, 0.5);
    const yaw = clamp(rot.y * 0.8, -0.8, 0.8);
    const roll = clamp(-rot.z * 0.8, -0.4, 0.4);

    prev.headRotX = lerp(prev.headRotX, pitch, LERP_FACTOR);
    prev.headRotY = lerp(prev.headRotY, yaw, LERP_FACTOR);
    prev.headRotZ = lerp(prev.headRotZ, roll, LERP_FACTOR);
    headBone.rotation.set(prev.headRotX, prev.headRotY, prev.headRotZ);
  } else if (headBone && landmarks.length >= 468) {
    // Fallback: estimate head rotation from landmarks
    const nose = landmarks[1];
    const leftEar = landmarks[234];
    const rightEar = landmarks[454];
    const forehead = landmarks[10];
    const chin = landmarks[152];

    const earMidX = (leftEar.x + rightEar.x) / 2;
    const yaw = clamp((nose.x - earMidX) * 3, -0.8, 0.8);
    const pitch = clamp((nose.y - (forehead.y + chin.y) / 2) * 2, -0.5, 0.5);
    const roll = clamp(-Math.atan2(rightEar.y - leftEar.y, rightEar.x - leftEar.x), -0.4, 0.4);

    prev.headRotX = lerp(prev.headRotX, -pitch, LERP_FACTOR);
    prev.headRotY = lerp(prev.headRotY, yaw, LERP_FACTOR);
    prev.headRotZ = lerp(prev.headRotZ, roll, LERP_FACTOR);
    headBone.rotation.set(prev.headRotX, prev.headRotY, prev.headRotZ);
  }

  // Apply blendshapes (expressions)
  if (blendshapes) {
    applyBlendshapes(vrm, blendshapes);
  }
}

interface BlendshapeCategory {
  categoryName: string;
  score: number;
}

function applyBlendshapes(vrm: VRM, categories: BlendshapeCategory[]): void {
  const map = new Map<string, number>();
  for (const cat of categories) {
    map.set(cat.categoryName, cat.score);
  }

  const expressionManager = vrm.expressionManager;
  if (!expressionManager) return;

  // Eye blink
  const blinkLeft = map.get("eyeBlinkLeft") ?? 0;
  const blinkRight = map.get("eyeBlinkRight") ?? 0;
  expressionManager.setValue("blinkLeft", blinkLeft);
  expressionManager.setValue("blinkRight", blinkRight);

  // Mouth
  const jawOpen = map.get("jawOpen") ?? 0;
  expressionManager.setValue("aa", clamp(jawOpen * 1.5, 0, 1));

  const mouthSmileLeft = map.get("mouthSmileLeft") ?? 0;
  const mouthSmileRight = map.get("mouthSmileRight") ?? 0;
  const smile = (mouthSmileLeft + mouthSmileRight) / 2;
  expressionManager.setValue("happy", clamp(smile * 2, 0, 1));

  // Eyebrows
  const browInnerUp = map.get("browInnerUp") ?? 0;
  const browDownLeft = map.get("browDownLeft") ?? 0;
  const browDownRight = map.get("browDownRight") ?? 0;
  const browDown = (browDownLeft + browDownRight) / 2;

  if (browInnerUp > 0.3) {
    expressionManager.setValue("surprised", clamp((browInnerUp - 0.3) * 2, 0, 1));
  } else {
    expressionManager.setValue("surprised", 0);
  }

  if (browDown > 0.3) {
    expressionManager.setValue("angry", clamp((browDown - 0.3) * 2, 0, 1));
  } else {
    expressionManager.setValue("angry", 0);
  }

  // Eye look direction — computed independently for each eye.
  // MediaPipe "Out" = toward the ear, "In" = toward the nose.
  const lookOutLeft = map.get("eyeLookOutLeft") ?? 0;
  const lookInLeft = map.get("eyeLookInLeft") ?? 0;
  const lookUpLeft = map.get("eyeLookUpLeft") ?? 0;
  const lookDownLeft = map.get("eyeLookDownLeft") ?? 0;

  const lookOutRight = map.get("eyeLookOutRight") ?? 0;
  const lookInRight = map.get("eyeLookInRight") ?? 0;
  const lookUpRight = map.get("eyeLookUpRight") ?? 0;
  const lookDownRight = map.get("eyeLookDownRight") ?? 0;

  const leftEyeX = clamp((lookOutLeft - lookInLeft) * 0.3, -0.15, 0.15);
  const leftEyeY = clamp((lookUpLeft - lookDownLeft) * 0.2, -0.1, 0.1);

  const rightEyeX = clamp((lookInRight - lookOutRight) * 0.3, -0.15, 0.15);
  const rightEyeY = clamp((lookUpRight - lookDownRight) * 0.2, -0.1, 0.1);

  const leftEye = vrm.humanoid.getNormalizedBoneNode("leftEye");
  const rightEye = vrm.humanoid.getNormalizedBoneNode("rightEye");
  if (leftEye) {
    leftEye.rotation.set(leftEyeY, leftEyeX, 0);
  }
  if (rightEye) {
    rightEye.rotation.set(rightEyeY, rightEyeX, 0);
  }
}

// Minimum visibility to trust a landmark (0..1)
const VISIBILITY_THRESHOLD = 0.5;

// Default rest pose (arms naturally at sides)
const REST_UPPER_Z_LEFT = 1.2;
const REST_UPPER_Z_RIGHT = -1.2;
const REST_LOWER_Y_LEFT = -0.3;
const REST_LOWER_Y_RIGHT = 0.3;

// Previous arm values for smoothing
const prevArm: Record<string, number> = {
  leftUpperZ: REST_UPPER_Z_LEFT,
  leftUpperX: 0,
  leftUpperY: 0,
  leftLowerY: REST_LOWER_Y_LEFT,
  rightUpperZ: REST_UPPER_Z_RIGHT,
  rightUpperX: 0,
  rightUpperY: 0,
  rightLowerY: REST_LOWER_Y_RIGHT,
};

function applyPoseTracking(vrm: VRM, result: TrackingResult): void {
  const { pose } = result;
  if (!pose?.landmarks?.length) return;

  const landmarks = pose.landmarks[0];
  if (landmarks.length < 25) return;

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftHip = landmarks.length > 23 ? landmarks[23] : undefined;
  const rightHip = landmarks.length > 24 ? landmarks[24] : undefined;

  // Spine rotation
  const spineNode = vrm.humanoid.getNormalizedBoneNode("spine");
  if (spineNode) {
    const spine = solveSpine(leftShoulder, rightShoulder, leftHip, rightHip);

    prev.spineRotX = lerp(prev.spineRotX, spine.roll, LERP_FACTOR);
    prev.spineRotY = lerp(prev.spineRotY, spine.yaw, LERP_FACTOR);
    const spinePitch = lerp(spineNode.rotation.x, spine.pitch, LERP_FACTOR);
    spineNode.rotation.set(spinePitch, prev.spineRotY, prev.spineRotX);
  }

  // Shoulder rotation (shrug)
  if (leftHip) {
    applyShoulderRotation(vrm, leftShoulder, leftHip, true);
  }
  if (rightHip) {
    applyShoulderRotation(vrm, rightShoulder, rightHip, false);
  }

  applyArmFromSolver(vrm, leftShoulder, leftElbow, leftWrist, true);
  applyArmFromSolver(vrm, rightShoulder, rightElbow, rightWrist, false);
}

function applyShoulderRotation(
  vrm: VRM,
  shoulder: { x: number; y: number; z: number },
  hip: { x: number; y: number; z: number },
  isLeft: boolean,
): void {
  const bone = vrm.humanoid.getNormalizedBoneNode(isLeft ? "leftShoulder" : "rightShoulder");
  if (!bone) return;

  const side = isLeft ? "left" : "right";
  const key = `${side}ShoulderZ`;
  const solved = solveShoulder(shoulder, hip, isLeft);

  prevArm[key] = lerp(prevArm[key] ?? 0, solved.shoulderZ, LERP_FACTOR);
  bone.rotation.set(0, 0, prevArm[key]);
}

function applyArmFromSolver(
  vrm: VRM,
  shoulder: { x: number; y: number; z: number; visibility?: number },
  elbow: { x: number; y: number; z: number; visibility?: number },
  wrist: { x: number; y: number; z: number; visibility?: number },
  isLeft: boolean,
): void {
  const upperArmBone = vrm.humanoid.getNormalizedBoneNode(
    isLeft ? "leftUpperArm" : "rightUpperArm",
  );
  const lowerArmBone = vrm.humanoid.getNormalizedBoneNode(
    isLeft ? "leftLowerArm" : "rightLowerArm",
  );

  if (!upperArmBone) return;

  const side = isLeft ? "left" : "right";
  const elbowVisible = (elbow.visibility ?? 0) >= VISIBILITY_THRESHOLD;
  const wristVisible = (wrist.visibility ?? 0) >= VISIBILITY_THRESHOLD;

  if (!elbowVisible) {
    // Low confidence: smoothly return to rest pose
    const restZ = isLeft ? REST_UPPER_Z_LEFT : REST_UPPER_Z_RIGHT;
    const restY = isLeft ? REST_LOWER_Y_LEFT : REST_LOWER_Y_RIGHT;
    prevArm[`${side}UpperZ`] = lerp(prevArm[`${side}UpperZ`], restZ, LERP_FACTOR_SLOW);
    prevArm[`${side}UpperX`] = lerp(prevArm[`${side}UpperX`], 0, LERP_FACTOR_SLOW);
    prevArm[`${side}UpperY`] = lerp(prevArm[`${side}UpperY`], 0, LERP_FACTOR_SLOW);
    prevArm[`${side}LowerY`] = lerp(prevArm[`${side}LowerY`], restY, LERP_FACTOR_SLOW);

    euler.set(prevArm[`${side}UpperX`], prevArm[`${side}UpperY`], prevArm[`${side}UpperZ`]);
    quat.setFromEuler(euler);
    upperArmBone.quaternion.copy(quat);

    if (lowerArmBone) {
      euler.set(0, prevArm[`${side}LowerY`], 0);
      quat.setFromEuler(euler);
      lowerArmBone.quaternion.copy(quat);
    }
    return;
  }

  const solved = solveArm(shoulder, elbow, wrist, isLeft);

  // Smooth all axes
  prevArm[`${side}UpperZ`] = lerp(prevArm[`${side}UpperZ`], solved.upperArmZ, LERP_FACTOR * 1.5);
  prevArm[`${side}UpperX`] = lerp(prevArm[`${side}UpperX`], solved.upperArmX, LERP_FACTOR * 1.5);
  prevArm[`${side}UpperY`] = lerp(prevArm[`${side}UpperY`], solved.upperArmY, LERP_FACTOR);

  euler.set(prevArm[`${side}UpperX`], prevArm[`${side}UpperY`], prevArm[`${side}UpperZ`]);
  quat.setFromEuler(euler);
  upperArmBone.quaternion.copy(quat);

  // Lower arm bend
  if (lowerArmBone && wristVisible) {
    prevArm[`${side}LowerY`] = lerp(prevArm[`${side}LowerY`], solved.lowerArmY, LERP_FACTOR);
  } else if (lowerArmBone) {
    const restY = isLeft ? REST_LOWER_Y_LEFT : REST_LOWER_Y_RIGHT;
    prevArm[`${side}LowerY`] = lerp(prevArm[`${side}LowerY`], restY, LERP_FACTOR_SLOW);
  }

  if (lowerArmBone) {
    // Elbow bend on Y, forearm twist (pronation/supination) on X (along bone axis)
    const twistKey = `${side}_forearm_twist`;
    const twist = (prevHandRot[twistKey] ?? 0) * 1.0;
    euler.set(twist, prevArm[`${side}LowerY`], 0);
    quat.setFromEuler(euler);
    lowerArmBone.quaternion.copy(quat);
  }
}

// --- Hand / Finger tracking ---

// VRM bone names per finger:
// Thumb:  Metacarpal, Proximal, Distal
// Others: Proximal, Intermediate, Distal
const FINGER_BONE_MAP = {
  thumb: {
    prefix: "Thumb",
    bones: ["Metacarpal", "Proximal", "Distal"] as const,
  },
  index: {
    prefix: "Index",
    bones: ["Proximal", "Intermediate", "Distal"] as const,
  },
  middle: {
    prefix: "Middle",
    bones: ["Proximal", "Intermediate", "Distal"] as const,
  },
  ring: {
    prefix: "Ring",
    bones: ["Proximal", "Intermediate", "Distal"] as const,
  },
  little: {
    prefix: "Little",
    bones: ["Proximal", "Intermediate", "Distal"] as const,
  },
} as const;

// Smoothed finger values
const prevFingers: Record<string, number> = {};

function fingerKey(side: string, finger: string, joint: number | string): string {
  return `${side}_${finger}_${joint}`;
}

// Smoothed hand rotation values
const prevHandRot: Record<string, number> = {};

function applyHandTracking(vrm: VRM, result: TrackingResult): void {
  const { hands } = result;
  if (!hands?.landmarks?.length) return;

  for (let h = 0; h < hands.landmarks.length; h++) {
    const landmarks = hands.landmarks[h];
    const handedness = hands.handedness[h]?.[0]?.categoryName;
    if (!handedness || landmarks.length < 21) continue;

    const isLeft = handedness === "Left";
    const side = isLeft ? "left" : "right";

    // Solve hand using 3D finger solver
    const solved = solveHand(landmarks);

    // Apply wrist/hand rotation and forearm twist
    applyHandRotation(vrm, landmarks, isLeft);

    // Apply finger rotations
    for (const [fingerName, fingerData] of Object.entries(FINGER_BONE_MAP)) {
      const fingerResult = solved[fingerName as keyof HandSolveResult];

      for (let j = 0; j < 3; j++) {
        const boneName = `${side}${fingerData.prefix}${fingerData.bones[j]}`;
        const bone = vrm.humanoid.getNormalizedBoneNode(boneName as VRMHumanBoneName);
        if (!bone) continue;

        // Smooth the curl value
        // Scale up raw angle: MediaPipe inter-segment angles are small
        // (typically 0–0.8 rad even for fully bent fingers), but VRM joints
        // need up to ~PI/2 per joint for a natural fist.
        const curlKey = fingerKey(side, fingerName, j);
        const curlScale = fingerName === "thumb" ? 1.4 : 1;
        const rawCurl = fingerResult.curls[j] * curlScale;
        const prevCurl = prevFingers[curlKey] ?? 0;
        prevFingers[curlKey] = lerp(prevCurl, rawCurl, 0.3);

        const smoothedCurl = prevFingers[curlKey];

        if (fingerName === "thumb") {
          // Thumb bone points +Y (up), not +X like other fingers.
          // Curl around X axis to bend from +Y toward palm.
          const curlX = isLeft ? smoothedCurl : -smoothedCurl;
          bone.rotation.set(curlX, 0, 0);
        } else {
          // Other fingers: bone points ±X, curl around Z axis
          const curlZ = isLeft ? smoothedCurl : -smoothedCurl;

          let spreadY = 0;
          if (j === 0) {
            const spreadKey = fingerKey(side, fingerName, "spread");
            const prevSpread = prevFingers[spreadKey] ?? 0;
            const targetSpread = clamp(-fingerResult.spread * 0.5, -0.4, 0.4);
            prevFingers[spreadKey] = lerp(prevSpread, targetSpread, LERP_FACTOR);
            spreadY = prevFingers[spreadKey];
          }

          bone.rotation.set(0, spreadY, curlZ);
        }
      }
    }
  }
}

function applyHandRotation(
  vrm: VRM,
  landmarks: Array<{ x: number; y: number; z: number }>,
  isLeft: boolean,
): void {
  const handBone = vrm.humanoid.getNormalizedBoneNode(isLeft ? "leftHand" : "rightHand");
  if (!handBone) return;

  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];
  const middleMcp = landmarks[9];

  // Palm direction: wrist → middle MCP
  const palmDx = middleMcp.x - wrist.x;
  const palmDy = middleMcp.y - wrist.y;
  const palmDz = middleMcp.z - wrist.z;

  // Palm width: index MCP → pinky MCP
  const widthDx = pinkyMcp.x - indexMcp.x;
  const widthDy = pinkyMcp.y - indexMcp.y;
  const widthDz = pinkyMcp.z - indexMcp.z;

  // Palm normal via cross product
  const nx = palmDy * widthDz - palmDz * widthDy;
  const nz = palmDx * widthDy - palmDy * widthDx;

  // Hand Z rotation (wrist flex/extend)
  const wristFlex = clamp(
    Math.atan2(-palmDy, Math.sqrt(palmDx * palmDx + palmDz * palmDz)) * 0.7,
    -0.8,
    0.8,
  );

  // Hand X rotation (wrist deviation: radial/ulnar)
  const wristDeviation = clamp(widthDy * 2, -0.3, 0.3);

  // Forearm twist (pronation/supination)
  const twist = clamp(Math.atan2(nx, nz), -1.5, 1.5);

  const side = isLeft ? "left" : "right";
  const pFlex = `${side}_hand_flex`;
  const pDev = `${side}_hand_dev`;
  const pTwist = `${side}_forearm_twist`;

  prevHandRot[pFlex] = lerp(prevHandRot[pFlex] ?? 0, wristFlex, LERP_FACTOR);
  prevHandRot[pDev] = lerp(prevHandRot[pDev] ?? 0, wristDeviation, LERP_FACTOR);
  prevHandRot[pTwist] = lerp(prevHandRot[pTwist] ?? 0, twist, LERP_FACTOR * 2);

  // Apply wrist flex/deviation to hand bone
  handBone.rotation.set(prevHandRot[pDev], 0, prevHandRot[pFlex]);

  // Store twist for lowerArm — applied in applyArmFromSolver to avoid
  // overwriting the elbow bend value set there.
  // (Do NOT modify lowerArm.rotation here; it would conflict with pose tracking.)
}

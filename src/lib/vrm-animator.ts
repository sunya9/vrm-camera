import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import * as THREE from "three";
import type { TrackingResult } from "./face-tracker";

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
  prevArm.leftLowerY = REST_LOWER_Y_LEFT;
  prevArm.rightUpperZ = REST_UPPER_Z_RIGHT;
  prevArm.rightLowerY = REST_LOWER_Y_RIGHT;
  for (const key of Object.keys(prevFingers)) delete prevFingers[key];
  for (const key of Object.keys(prevHandRot)) delete prevHandRot[key];
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

  // Eye look direction
  const lookOutLeft = map.get("eyeLookOutLeft") ?? 0;
  const lookInLeft = map.get("eyeLookInLeft") ?? 0;
  const lookUpLeft = map.get("eyeLookUpLeft") ?? 0;
  const lookDownLeft = map.get("eyeLookDownLeft") ?? 0;

  const eyeX = clamp((lookOutLeft - lookInLeft) * 0.3, -0.15, 0.15);
  const eyeY = clamp((lookUpLeft - lookDownLeft) * 0.2, -0.1, 0.1);

  const leftEye = vrm.humanoid.getNormalizedBoneNode("leftEye");
  const rightEye = vrm.humanoid.getNormalizedBoneNode("rightEye");
  if (leftEye) {
    leftEye.rotation.set(eyeY, eyeX, 0);
  }
  if (rightEye) {
    rightEye.rotation.set(eyeY, eyeX, 0);
  }
}

function applyPoseTracking(vrm: VRM, result: TrackingResult): void {
  const { pose } = result;
  if (!pose?.landmarks?.length) return;

  const landmarks = pose.landmarks[0];
  if (landmarks.length < 25) return;

  // Pose landmark indices (MediaPipe)
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];

  // Spine rotation from shoulder tilt (subtle)
  const spineNode = vrm.humanoid.getNormalizedBoneNode("spine");
  if (spineNode) {
    // Slight shoulder tilt → spine roll
    const shoulderDy = rightShoulder.y - leftShoulder.y;
    const spineRoll = clamp(shoulderDy * 0.3, -0.05, 0.05);

    // Body turn from depth difference
    const shoulderDz = rightShoulder.z - leftShoulder.z;
    const spineYaw = clamp(shoulderDz * 0.5, -0.08, 0.08);

    prev.spineRotY = lerp(prev.spineRotY, spineYaw, 0.02);
    prev.spineRotX = lerp(prev.spineRotX, spineRoll, 0.02);
    spineNode.rotation.set(0, prev.spineRotY, prev.spineRotX);
  }

  applyArm(vrm, leftShoulder, leftElbow, leftWrist, true);
  applyArm(vrm, rightShoulder, rightElbow, rightWrist, false);
}

interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

// Minimum visibility to trust a landmark (0..1)
const VISIBILITY_THRESHOLD = 0.5;

// Default rest pose (arms naturally at sides)
const REST_UPPER_Z_LEFT = 1.2;
const REST_UPPER_Z_RIGHT = -1.2;
const REST_LOWER_Y_LEFT = -0.3;
const REST_LOWER_Y_RIGHT = 0.3;

// Previous arm values for smoothing
const prevArm = {
  leftUpperZ: REST_UPPER_Z_LEFT,
  leftLowerY: REST_LOWER_Y_LEFT,
  rightUpperZ: REST_UPPER_Z_RIGHT,
  rightLowerY: REST_LOWER_Y_RIGHT,
};

function applyArm(
  vrm: VRM,
  shoulder: Landmark,
  elbow: Landmark,
  wrist: Landmark,
  isLeft: boolean,
): void {
  const upperArm = vrm.humanoid.getNormalizedBoneNode(isLeft ? "leftUpperArm" : "rightUpperArm");
  const lowerArm = vrm.humanoid.getNormalizedBoneNode(isLeft ? "leftLowerArm" : "rightLowerArm");

  if (!upperArm) return;

  const pZ = isLeft ? "leftUpperZ" : "rightUpperZ";
  const pY = isLeft ? "leftLowerY" : "rightLowerY";

  // Check visibility of elbow (key joint for arm tracking)
  const elbowVisible = (elbow.visibility ?? 0) >= VISIBILITY_THRESHOLD;
  const wristVisible = (wrist.visibility ?? 0) >= VISIBILITY_THRESHOLD;

  if (!elbowVisible) {
    // Low confidence: smoothly return to rest pose
    const restZ = isLeft ? REST_UPPER_Z_LEFT : REST_UPPER_Z_RIGHT;
    const restY = isLeft ? REST_LOWER_Y_LEFT : REST_LOWER_Y_RIGHT;
    prevArm[pZ] = lerp(prevArm[pZ], restZ, LERP_FACTOR_SLOW);
    prevArm[pY] = lerp(prevArm[pY], restY, LERP_FACTOR_SLOW);

    euler.set(0, 0, prevArm[pZ]);
    quat.setFromEuler(euler);
    upperArm.quaternion.copy(quat);

    if (lowerArm) {
      euler.set(0, prevArm[pY], 0);
      quat.setFromEuler(euler);
      lowerArm.quaternion.copy(quat);
    }
    return;
  }

  // MediaPipe: x goes right, y goes down in normalized image coords
  const dx = elbow.x - shoulder.x;
  const dy = elbow.y - shoulder.y;

  // Upper arm Z rotation (raise/lower)
  // VRM T-pose: Z=0 is arms horizontal. Negative Z (left) / Positive Z (right) = arms down
  // atan2(dx, dy): 0 when elbow directly below, PI/2 when elbow to the side
  const armAngle = Math.atan2(isLeft ? dx : -dx, dy);
  // Map: 0 (down) → negative Z for left / positive Z for right, PI/2 (horizontal) → 0
  const upperZ = isLeft
    ? clamp(-(armAngle - Math.PI / 2), -Math.PI / 2, Math.PI / 2)
    : clamp(armAngle - Math.PI / 2, -Math.PI / 2, Math.PI / 2);

  prevArm[pZ] = lerp(prevArm[pZ], upperZ, LERP_FACTOR * 1.5);

  euler.set(0, 0, prevArm[pZ]);
  quat.setFromEuler(euler);
  upperArm.quaternion.copy(quat);

  // Lower arm (forearm bend)
  if (lowerArm && wristVisible) {
    const upperLen = Math.sqrt(dx * dx + dy * dy);
    const lowerDx = wrist.x - elbow.x;
    const lowerDy = wrist.y - elbow.y;
    const lowerLen = Math.sqrt(lowerDx * lowerDx + lowerDy * lowerDy);

    const dot = (dx * lowerDx + dy * lowerDy) / (upperLen * lowerLen + 0.001);
    const bendAngle = Math.acos(clamp(dot, -1, 1));

    const lowerY = isLeft ? clamp(-bendAngle, -2.5, 0) : clamp(bendAngle, 0, 2.5);

    prevArm[pY] = lerp(prevArm[pY], lowerY, LERP_FACTOR);
  } else if (lowerArm) {
    // Wrist not visible: relax forearm to rest
    const restY = isLeft ? REST_LOWER_Y_LEFT : REST_LOWER_Y_RIGHT;
    prevArm[pY] = lerp(prevArm[pY], restY, LERP_FACTOR_SLOW);
  }

  if (lowerArm) {
    euler.set(0, prevArm[pY], 0);
    quat.setFromEuler(euler);
    lowerArm.quaternion.copy(quat);
  }
}

// --- Hand / Finger tracking ---

// MediaPipe hand landmark indices
// 0: wrist, 1-4: thumb, 5-8: index, 9-12: middle, 13-16: ring, 17-20: pinky
// Each finger: [MCP, PIP, DIP, TIP]

// MediaPipe hand landmark indices per finger:
// Thumb:  1=CMC, 2=MCP, 3=IP, 4=TIP
// Others: MCP, PIP, DIP, TIP
//
// VRM bone names:
// Thumb:  Metacarpal, Proximal, Distal
// Others: Proximal, Intermediate, Distal
const FINGER_MAP: Array<{
  name: string;
  indices: [number, number, number, number];
  bones: [string, string, string];
}> = [
  { name: "thumb", indices: [1, 2, 3, 4], bones: ["Metacarpal", "Proximal", "Distal"] },
  { name: "index", indices: [5, 6, 7, 8], bones: ["Proximal", "Intermediate", "Distal"] },
  { name: "middle", indices: [9, 10, 11, 12], bones: ["Proximal", "Intermediate", "Distal"] },
  { name: "ring", indices: [13, 14, 15, 16], bones: ["Proximal", "Intermediate", "Distal"] },
  { name: "little", indices: [17, 18, 19, 20], bones: ["Proximal", "Intermediate", "Distal"] },
];

// Smoothed finger curl values: [left/right][finger][joint]
const prevFingers: Record<string, number> = {};

function fingerKey(side: string, finger: string, joint: number): string {
  return `${side}_${finger}_${joint}`;
}

function applyHandTracking(vrm: VRM, result: TrackingResult): void {
  const { hands } = result;
  if (!hands?.landmarks?.length) return;

  for (let h = 0; h < hands.landmarks.length; h++) {
    const landmarks = hands.landmarks[h];
    const handedness = hands.handedness[h]?.[0]?.categoryName;
    if (!handedness || landmarks.length < 21) continue;

    // MediaPipe "Left" hand in camera = user's left hand (when not mirrored)
    // When mirrored, swap
    const isLeft = handedness === "Left";

    const side = isLeft ? "left" : "right";
    const vrmSide = isLeft ? "left" : "right";

    // Apply wrist/hand rotation from palm orientation
    applyHandRotation(vrm, landmarks, isLeft);

    for (const finger of FINGER_MAP) {
      const [mcp, pip, dip, tip] = finger.indices;

      for (let j = 0; j < 3; j++) {
        const fromIdx = [mcp, pip, dip][j];
        const toIdx = [pip, dip, tip][j];

        const from = landmarks[fromIdx];
        const to = landmarks[toIdx];

        // Compute curl angle from consecutive landmarks
        const parentIdx = j === 0 ? 0 : [mcp, pip, dip][j - 1];
        const parent = landmarks[parentIdx];

        const v1x = from.x - parent.x;
        const v1y = from.y - parent.y;
        const v2x = to.x - from.x;
        const v2y = to.y - from.y;

        const len1 = Math.sqrt(v1x * v1x + v1y * v1y) + 0.001;
        const len2 = Math.sqrt(v2x * v2x + v2y * v2y) + 0.001;
        const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
        const angle = Math.acos(clamp(dot, -1, 1));

        // Curl: 0 = straight, positive = curled
        const curl = clamp(angle * 0.8, 0, Math.PI / 2);

        const key = fingerKey(side, finger.name, j);
        const prevVal = prevFingers[key] ?? 0;
        prevFingers[key] = lerp(prevVal, curl, LERP_FACTOR);

        // VRM bone name: e.g. "leftIndexProximal", "rightThumbDistal"
        const capitalName = finger.name.charAt(0).toUpperCase() + finger.name.slice(1);
        const boneName = `${vrmSide}${capitalName}${finger.bones[j]}`;
        const bone = vrm.humanoid.getNormalizedBoneNode(boneName as VRMHumanBoneName);

        if (bone) {
          // Fingers curl around Z axis for VRM normalized bones
          // Left hand: positive Z = curl inward, Right hand: negative Z = curl inward
          const curlZ = isLeft ? prevFingers[key] : -prevFingers[key];

          // Spread (abduction) on proximal bones only (Y axis)
          let spreadY = 0;
          if (j === 0 && finger.name !== "thumb") {
            const spreadKey = fingerKey(side, finger.name, 99);
            const fi = FINGER_MAP.indexOf(finger);
            // Compute angle between this finger and middle finger (reference)
            const thisTip = landmarks[finger.indices[3]];
            const thisMcp = landmarks[finger.indices[0]];
            const midTip = landmarks[12]; // middle finger tip
            const midMcp = landmarks[9]; // middle finger MCP

            const ax = thisTip.x - thisMcp.x;
            const ay = thisTip.y - thisMcp.y;
            const bx = midTip.x - midMcp.x;
            const by = midTip.y - midMcp.y;

            const lenA = Math.sqrt(ax * ax + ay * ay) + 0.001;
            const lenB = Math.sqrt(bx * bx + by * by) + 0.001;
            const cross = ax * by - ay * bx;
            const spreadAngle = Math.asin(clamp(cross / (lenA * lenB), -1, 1));

            // Scale spread; fingers further from middle get more spread
            const spreadScale = fi <= 2 ? 0.6 : 0.8;
            const targetSpread = clamp(spreadAngle * spreadScale, -0.4, 0.4);

            const prevSpread = prevFingers[spreadKey] ?? 0;
            prevFingers[spreadKey] = lerp(prevSpread, targetSpread, LERP_FACTOR);
            spreadY = prevFingers[spreadKey];
          }

          bone.rotation.set(0, spreadY, curlZ);
        }
      }
    }
  }
}

// Smoothed hand rotation values
const prevHandRot: Record<string, number> = {};

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

  // Hand Z rotation (wrist flex/extend): angle of palm direction from horizontal
  // MediaPipe Y is down, so -palmDy = upward component
  const wristFlex = clamp(
    Math.atan2(-palmDy, Math.sqrt(palmDx * palmDx + palmDz * palmDz)) * 0.4,
    -0.6,
    0.6,
  );

  // Hand X rotation (wrist deviation: radial/ulnar)
  // Determined by the palm width vector tilt
  const wristDeviation = clamp(widthDy * 2, -0.3, 0.3);

  // Forearm twist (pronation/supination): determined by palm normal Z component
  // When palm faces camera (nz > 0 for left), forearm is supinated
  const twist = clamp(Math.atan2(nx, nz) * 0.5, -1.0, 1.0);

  const side = isLeft ? "left" : "right";
  const pFlex = `${side}_hand_flex`;
  const pDev = `${side}_hand_dev`;
  const pTwist = `${side}_forearm_twist`;

  prevHandRot[pFlex] = lerp(prevHandRot[pFlex] ?? 0, wristFlex, LERP_FACTOR);
  prevHandRot[pDev] = lerp(prevHandRot[pDev] ?? 0, wristDeviation, LERP_FACTOR);
  prevHandRot[pTwist] = lerp(prevHandRot[pTwist] ?? 0, twist, LERP_FACTOR);

  // Apply wrist flex/deviation to hand bone
  handBone.rotation.set(prevHandRot[pDev], 0, prevHandRot[pFlex]);
}

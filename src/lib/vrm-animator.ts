import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import type { TrackingResult } from "./face-tracker";

/**
 * Maps MediaPipe tracking results to VRM bone rotations and expressions.
 * Inspired by Kalidokit but simplified for our use case.
 */

const euler = new THREE.Euler();
const quat = new THREE.Quaternion();

// Lerp factor for smooth animation
const LERP_FACTOR = 0.5;

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

export function applyTracking(vrm: VRM, result: TrackingResult): void {
  applyFaceTracking(vrm, result);
  applyPoseTracking(vrm, result);
}

function applyFaceTracking(vrm: VRM, result: TrackingResult): void {
  const { face } = result;
  if (!face?.faceLandmarks?.length) return;

  const landmarks = face.faceLandmarks[0];
  const blendshapes = face.faceBlendshapes?.[0]?.categories;
  const matrix = face.facialTransformationMatrixes?.[0];

  // Apply head rotation from transformation matrix
  if (matrix) {
    const m = new THREE.Matrix4().fromArray(matrix.data);
    const rotation = new THREE.Euler().setFromRotationMatrix(m);

    const headBone = vrm.humanoid.getNormalizedBoneNode("head");
    if (headBone) {
      prev.headRotX = lerp(prev.headRotX, rotation.x, LERP_FACTOR);
      prev.headRotY = lerp(prev.headRotY, rotation.y, LERP_FACTOR);
      prev.headRotZ = lerp(prev.headRotZ, rotation.z, LERP_FACTOR);
      headBone.rotation.set(prev.headRotX, prev.headRotY, prev.headRotZ);
    }
  } else if (landmarks.length >= 468) {
    // Fallback: estimate head rotation from landmarks
    const nose = landmarks[1];
    const leftEar = landmarks[234];
    const rightEar = landmarks[454];
    const forehead = landmarks[10];
    const chin = landmarks[152];

    const headBone = vrm.humanoid.getNormalizedBoneNode("head");
    if (headBone) {
      // Yaw from ear-to-ear midpoint vs nose
      const earMidX = (leftEar.x + rightEar.x) / 2;
      const yaw = (nose.x - earMidX) * 4;

      // Pitch from forehead-chin line
      const pitch = (nose.y - (forehead.y + chin.y) / 2) * 3;

      // Roll from ear tilt
      const roll = Math.atan2(rightEar.y - leftEar.y, rightEar.x - leftEar.x);

      prev.headRotX = lerp(prev.headRotX, pitch, LERP_FACTOR);
      prev.headRotY = lerp(prev.headRotY, -yaw, LERP_FACTOR);
      prev.headRotZ = lerp(prev.headRotZ, -roll, LERP_FACTOR);
      headBone.rotation.set(prev.headRotX, prev.headRotY, prev.headRotZ);
    }
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

  const eyeX = (lookOutLeft - lookInLeft) * 0.8;
  const eyeY = (lookUpLeft - lookDownLeft) * 0.5;

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
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  // Spine rotation from shoulder/hip alignment
  const spineNode = vrm.humanoid.getNormalizedBoneNode("spine");
  if (spineNode) {
    const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const hipMidX = (leftHip.x + rightHip.x) / 2;
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipMidY = (leftHip.y + rightHip.y) / 2;

    const spineYaw = (shoulderMidX - hipMidX) * 2;
    const spinePitch = (shoulderMidY - hipMidY - 0.3) * 1.5;

    prev.spineRotX = lerp(prev.spineRotX, clamp(spinePitch, -0.3, 0.3), LERP_FACTOR * 0.5);
    prev.spineRotY = lerp(prev.spineRotY, clamp(-spineYaw, -0.5, 0.5), LERP_FACTOR * 0.5);
    spineNode.rotation.set(prev.spineRotX, prev.spineRotY, 0);
  }

  // Left arm
  const leftUpperArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
  const leftLowerArm = vrm.humanoid.getNormalizedBoneNode("leftLowerArm");
  if (leftUpperArm) {
    const armAngle = computeArmAngle(leftShoulder, leftElbow, true);
    prev.leftUpperArmZ = lerp(prev.leftUpperArmZ, armAngle.z, LERP_FACTOR);
    euler.set(armAngle.x, 0, prev.leftUpperArmZ);
    quat.setFromEuler(euler);
    leftUpperArm.quaternion.copy(quat);
  }
  if (leftLowerArm && leftElbow && leftWrist) {
    const forearmAngle = computeForearmAngle(leftShoulder, leftElbow, leftWrist);
    euler.set(0, forearmAngle.y, 0);
    quat.setFromEuler(euler);
    leftLowerArm.quaternion.copy(quat);
  }

  // Right arm
  const rightUpperArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
  const rightLowerArm = vrm.humanoid.getNormalizedBoneNode("rightLowerArm");
  if (rightUpperArm) {
    const armAngle = computeArmAngle(rightShoulder, rightElbow, false);
    prev.rightUpperArmZ = lerp(prev.rightUpperArmZ, armAngle.z, LERP_FACTOR);
    euler.set(armAngle.x, 0, prev.rightUpperArmZ);
    quat.setFromEuler(euler);
    rightUpperArm.quaternion.copy(quat);
  }
  if (rightLowerArm && rightElbow && rightWrist) {
    const forearmAngle = computeForearmAngle(rightShoulder, rightElbow, rightWrist);
    euler.set(0, -forearmAngle.y, 0);
    quat.setFromEuler(euler);
    rightLowerArm.quaternion.copy(quat);
  }
}

interface Landmark {
  x: number;
  y: number;
  z: number;
}

function computeArmAngle(
  shoulder: Landmark,
  elbow: Landmark,
  isLeft: boolean,
): { x: number; z: number } {
  const dx = elbow.x - shoulder.x;
  const dy = elbow.y - shoulder.y;

  // Z rotation: arm raise (positive = raise for left, negative for right)
  const raise = Math.atan2(-dy, isLeft ? dx : -dx);
  const z = clamp(isLeft ? raise : -raise, isLeft ? 0 : -Math.PI / 2, isLeft ? Math.PI / 2 : 0);

  // X rotation: arm forward/back
  const dz = elbow.z - shoulder.z;
  const x = clamp(dz * 3, -0.5, 0.5);

  return { x, z };
}

function computeForearmAngle(
  shoulder: Landmark,
  elbow: Landmark,
  wrist: Landmark,
): { y: number } {
  const upperDx = elbow.x - shoulder.x;
  const upperDy = elbow.y - shoulder.y;
  const lowerDx = wrist.x - elbow.x;
  const lowerDy = wrist.y - elbow.y;

  const angle = Math.atan2(lowerDy, lowerDx) - Math.atan2(upperDy, upperDx);
  return { y: clamp(angle, -Math.PI * 0.8, 0) };
}

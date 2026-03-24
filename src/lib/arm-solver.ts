/**
 * Pure functions for solving arm rotations from MediaPipe pose landmarks.
 * No dependency on THREE.js or VRM.
 */

interface Vec3 {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface ShoulderSolveResult {
  /** Shoulder Z rotation (shrug up/down, radians) */
  shoulderZ: number;
}

export interface ArmSolveResult {
  /** Upper arm Z rotation (raise/lower, radians) */
  upperArmZ: number;
  /** Upper arm X rotation (forward/backward, radians) */
  upperArmX: number;
  /** Upper arm Y rotation (twist, radians) */
  upperArmY: number;
  /** Lower arm Y rotation (elbow bend, radians) */
  lowerArmY: number;
}

export interface SpineSolveResult {
  /** Spine roll from shoulder tilt (radians) */
  roll: number;
  /** Spine yaw from body turn (radians) */
  yaw: number;
  /** Spine pitch from forward/backward lean (radians) */
  pitch: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Solve arm rotations from shoulder, elbow, and wrist landmarks.
 *
 * @param shoulder - Shoulder landmark
 * @param elbow - Elbow landmark
 * @param wrist - Wrist landmark
 * @param isLeft - Whether this is the left arm
 * @returns Arm rotation angles in radians
 */
export function solveArm(
  shoulder: Vec3,
  elbow: Vec3,
  wrist: Vec3,
  isLeft: boolean,
): ArmSolveResult {
  // --- Upper arm raise/lower (Z axis) ---
  // MediaPipe image coords: user's left arm appears on the right side (larger x).
  // dx > 0 means elbow extends outward for left arm in image space.
  //
  // armAngle measures from "arm straight down" (0) to "arm horizontal" (PI/2) to "arm up" (PI).
  // We then map: 0 → PI/2 (down), PI/2 → 0 (horizontal/T-pose), PI → -PI/2 (up).
  const dx = elbow.x - shoulder.x;
  const dy = elbow.y - shoulder.y;
  const armAngle = Math.atan2(isLeft ? dx : -dx, dy);
  const upperArmZ = isLeft
    ? clamp(-(armAngle - Math.PI / 2), -Math.PI / 2, Math.PI / 2)
    : clamp(armAngle - Math.PI / 2, -Math.PI / 2, Math.PI / 2);

  // Upper arm X (forward/backward) and Y (twist) disabled:
  // depth (z) interferes with arm raise; twist handled by lowerArm.
  const upperArmX = 0;
  const upperArmY = 0;

  // --- Lower arm bend (Y axis) ---
  const upperDx = elbow.x - shoulder.x;
  const upperDy = elbow.y - shoulder.y;
  const upperDz = elbow.z - shoulder.z;
  const lowerDx = wrist.x - elbow.x;
  const lowerDy = wrist.y - elbow.y;
  const lowerDz = wrist.z - elbow.z;

  const upperLen = Math.sqrt(upperDx * upperDx + upperDy * upperDy + upperDz * upperDz) + 1e-6;
  const lowerLen = Math.sqrt(lowerDx * lowerDx + lowerDy * lowerDy + lowerDz * lowerDz) + 1e-6;

  const dot = (upperDx * lowerDx + upperDy * lowerDy + upperDz * lowerDz) / (upperLen * lowerLen);
  const bendAngle = Math.acos(clamp(dot, -1, 1));

  const scaledBend = bendAngle * 1.3;
  const lowerArmY = isLeft ? clamp(-scaledBend, -2.5, 0) : clamp(scaledBend, 0, 2.5);

  return { upperArmZ, upperArmX, upperArmY, lowerArmY };
}

/**
 * Solve spine rotation from shoulder landmarks.
 *
 * @param leftShoulder - Left shoulder landmark
 * @param rightShoulder - Right shoulder landmark
 * @param leftHip - Left hip landmark (optional, for pitch)
 * @param rightHip - Right hip landmark (optional, for pitch)
 * @returns Spine rotation angles in radians
 */
export function solveSpine(
  leftShoulder: Vec3,
  rightShoulder: Vec3,
  leftHip?: Vec3,
  rightHip?: Vec3,
): SpineSolveResult {
  // Roll: shoulder tilt (one shoulder higher than the other)
  const shoulderDy = rightShoulder.y - leftShoulder.y;
  const roll = clamp(shoulderDy * 0.5, -0.15, 0.15);

  // Yaw: body turn (depth difference between shoulders)
  const shoulderDz = rightShoulder.z - leftShoulder.z;
  const yaw = clamp(shoulderDz * 1.0, -0.3, 0.3);

  // Pitch: forward/backward lean (from shoulder-hip relationship)
  let pitch = 0;
  if (leftHip && rightHip) {
    const shoulderMidZ = (leftShoulder.z + rightShoulder.z) / 2;
    const hipMidZ = (leftHip.z + rightHip.z) / 2;
    const leanDz = shoulderMidZ - hipMidZ;
    pitch = clamp(leanDz * 2, -0.15, 0.15);
  }

  return { roll, yaw, pitch };
}

// Calibrated neutral shoulder-hip distances per side.
// Set on first detection, used as baseline for shrug detection.
const neutralShoulderHipDy: { left: number | null; right: number | null } = {
  left: null,
  right: null,
};

/**
 * Reset shoulder calibration (call when tracking restarts).
 */
export function resetShoulderCalibration(): void {
  neutralShoulderHipDy.left = null;
  neutralShoulderHipDy.right = null;
}

/**
 * Solve shoulder rotation from shoulder and hip landmarks.
 * Detects shrugging (shoulder raised/lowered relative to neutral).
 * Auto-calibrates the neutral distance on first detection.
 *
 * @param shoulder - Shoulder landmark
 * @param hip - Hip landmark on the same side
 * @param isLeft - Whether this is the left shoulder
 * @returns Shoulder rotation angles
 */
export function solveShoulder(shoulder: Vec3, hip: Vec3, isLeft: boolean): ShoulderSolveResult {
  const dy = hip.y - shoulder.y; // positive = hip below shoulder (normal)
  const side = isLeft ? "left" : "right";

  // Auto-calibrate on first detection
  if (neutralShoulderHipDy[side] === null) {
    neutralShoulderHipDy[side] = dy;
  }

  // Slowly adapt neutral to account for distance changes (moving average)
  neutralShoulderHipDy[side] = neutralShoulderHipDy[side]! * 0.995 + dy * 0.005;

  const neutralDy = neutralShoulderHipDy[side]!;
  const shrugAmount = clamp((neutralDy - dy) * 2.0, -0.2, 0.3);

  // VRM shoulder Z: for left, negative Z = shrug up; for right, positive Z = shrug up
  const shoulderZ = isLeft ? -shrugAmount : shrugAmount;

  return { shoulderZ };
}

/**
 * Pure functions for solving finger rotations from MediaPipe hand landmarks.
 * No dependency on THREE.js or VRM — takes landmark arrays, returns angles.
 */

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Compute the curl angle for a finger joint using 3D vectors.
 *
 * Given three consecutive landmarks (parent → current → child),
 * calculates the angle between the two segments.
 * A straight finger gives ~0, a curled finger gives a larger angle.
 */
export function computeCurl(parent: Vec3, current: Vec3, child: Vec3): number {
  // Vector from parent to current
  const v1x = current.x - parent.x;
  const v1y = current.y - parent.y;
  const v1z = current.z - parent.z;

  // Vector from current to child
  const v2x = child.x - current.x;
  const v2y = child.y - current.y;
  const v2z = child.z - current.z;

  const len1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z) + 1e-6;
  const len2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z) + 1e-6;

  const dot = (v1x * v2x + v1y * v2y + v1z * v2z) / (len1 * len2);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

  return angle;
}

/**
 * Compute the spread (abduction) angle for a finger relative to the middle finger.
 * Uses the full 3D cross product to determine direction.
 *
 * @param fingerMcp - MCP of the finger
 * @param fingerTip - TIP of the finger
 * @param middleMcp - MCP of the middle finger (reference)
 * @param middleTip - TIP of the middle finger (reference)
 * @returns Signed spread angle in radians
 */
export function computeSpread(
  fingerMcp: Vec3,
  fingerTip: Vec3,
  middleMcp: Vec3,
  middleTip: Vec3,
): number {
  // Direction vectors for each finger
  const ax = fingerTip.x - fingerMcp.x;
  const ay = fingerTip.y - fingerMcp.y;
  const az = fingerTip.z - fingerMcp.z;

  const bx = middleTip.x - middleMcp.x;
  const by = middleTip.y - middleMcp.y;
  const bz = middleTip.z - middleMcp.z;

  const lenA = Math.sqrt(ax * ax + ay * ay + az * az) + 1e-6;
  const lenB = Math.sqrt(bx * bx + by * by + bz * bz) + 1e-6;

  // Cross product magnitude (for signed angle)
  const crossX = ay * bz - az * by;
  const crossY = az * bx - ax * bz;
  const crossZ = ax * by - ay * bx;
  const crossLen = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);

  const dot = (ax * bx + ay * by + az * bz) / (lenA * lenB);
  const sinAngle = crossLen / (lenA * lenB);

  // Use atan2 for signed angle
  const angle = Math.atan2(sinAngle, dot);

  // Determine sign from cross product Z component (palm-relative)
  return crossZ >= 0 ? angle : -angle;
}

/** MediaPipe hand landmark indices */
export const HAND_LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export interface FingerSolveResult {
  /** Per-joint curl angles [joint0, joint1, joint2] in radians */
  curls: [number, number, number];
  /** Spread angle for the proximal joint (radians), 0 for thumb */
  spread: number;
}

export interface HandSolveResult {
  thumb: FingerSolveResult;
  index: FingerSolveResult;
  middle: FingerSolveResult;
  ring: FingerSolveResult;
  little: FingerSolveResult;
}

const FINGER_DEFS = [
  {
    name: "thumb" as const,
    indices: [
      HAND_LANDMARKS.THUMB_CMC,
      HAND_LANDMARKS.THUMB_MCP,
      HAND_LANDMARKS.THUMB_IP,
      HAND_LANDMARKS.THUMB_TIP,
    ],
    isThumb: true,
  },
  {
    name: "index" as const,
    indices: [
      HAND_LANDMARKS.INDEX_MCP,
      HAND_LANDMARKS.INDEX_PIP,
      HAND_LANDMARKS.INDEX_DIP,
      HAND_LANDMARKS.INDEX_TIP,
    ],
    isThumb: false,
  },
  {
    name: "middle" as const,
    indices: [
      HAND_LANDMARKS.MIDDLE_MCP,
      HAND_LANDMARKS.MIDDLE_PIP,
      HAND_LANDMARKS.MIDDLE_DIP,
      HAND_LANDMARKS.MIDDLE_TIP,
    ],
    isThumb: false,
  },
  {
    name: "ring" as const,
    indices: [
      HAND_LANDMARKS.RING_MCP,
      HAND_LANDMARKS.RING_PIP,
      HAND_LANDMARKS.RING_DIP,
      HAND_LANDMARKS.RING_TIP,
    ],
    isThumb: false,
  },
  {
    name: "little" as const,
    indices: [
      HAND_LANDMARKS.PINKY_MCP,
      HAND_LANDMARKS.PINKY_PIP,
      HAND_LANDMARKS.PINKY_DIP,
      HAND_LANDMARKS.PINKY_TIP,
    ],
    isThumb: false,
  },
] as const;

/**
 * Solve all finger rotations from a 21-point MediaPipe hand landmark array.
 */
export function solveHand(landmarks: Vec3[]): HandSolveResult {
  const wrist = landmarks[HAND_LANDMARKS.WRIST];
  const middleMcp = landmarks[HAND_LANDMARKS.MIDDLE_MCP];
  const middleTip = landmarks[HAND_LANDMARKS.MIDDLE_TIP];

  const result: Record<string, FingerSolveResult> = {};

  for (const finger of FINGER_DEFS) {
    const [i0, i1, i2, i3] = finger.indices;
    const lm0 = landmarks[i0];
    const lm1 = landmarks[i1];
    const lm2 = landmarks[i2];
    const lm3 = landmarks[i3];

    // For the first joint, use wrist as parent (or CMC for thumb)
    const parent0 = finger.isThumb ? wrist : wrist;

    const curls: [number, number, number] = [
      computeCurl(parent0, lm0, lm1),
      computeCurl(lm0, lm1, lm2),
      computeCurl(lm1, lm2, lm3),
    ];

    let spread = 0;
    if (!finger.isThumb) {
      spread = computeSpread(lm0, lm3, middleMcp, middleTip);
    }

    result[finger.name] = { curls, spread };
  }

  return result as unknown as HandSolveResult;
}

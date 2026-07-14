import { beforeEach, describe, expect, it } from "vitest";
import { solveArm, solveShoulder, solveSpine, resetShoulderCalibration } from "./arm-solver";

describe("solveArm", () => {
  // Base positions: shoulder at origin-ish
  const shoulder = { x: 0.3, y: 0.4, z: 0 };

  describe("upper arm raise/lower (Z axis)", () => {
    it("arm hanging down: Z is positive for left arm", () => {
      // In MediaPipe image, left shoulder at x=0.3, elbow directly below
      const elbow = { x: 0.3, y: 0.6, z: 0 };
      const wrist = { x: 0.3, y: 0.8, z: 0 };
      const result = solveArm(shoulder, elbow, wrist, true);
      // armAngle = atan2(0, 0.2) ≈ 0, upperZ = -(0 - PI/2)*0.7 ≈ 1.1 > 0
      expect(result.upperArmZ).toBeGreaterThan(0.5);
    });

    it("arm raised horizontal (T-pose): Z is near 0", () => {
      // Left arm extends to the right in image (larger x = outward)
      const elbow = { x: 0.45, y: 0.4, z: 0 };
      const wrist = { x: 0.6, y: 0.4, z: 0 };
      const result = solveArm(shoulder, elbow, wrist, true);
      // armAngle = atan2(0.15, 0) = PI/2, upperZ = -(PI/2-PI/2)*0.7 = 0
      expect(Math.abs(result.upperArmZ)).toBeLessThan(0.2);
    });

    it("arm raised up: Z is negative for left arm", () => {
      const elbow = { x: 0.3, y: 0.2, z: 0 }; // above shoulder
      const wrist = { x: 0.3, y: 0.0, z: 0 };
      const result = solveArm(shoulder, elbow, wrist, true);
      expect(result.upperArmZ).toBeLessThan(0);
    });

    it("right arm down: Z is negative", () => {
      const rShoulder = { x: 0.7, y: 0.4, z: 0 };
      // Right arm: elbow below, same x (dx=0, -dx=0)
      const elbow = { x: 0.7, y: 0.6, z: 0 };
      const wrist = { x: 0.7, y: 0.8, z: 0 };
      const result = solveArm(rShoulder, elbow, wrist, false);
      expect(result.upperArmZ).toBeLessThan(-0.5);
    });

    it("right arm horizontal: Z near 0", () => {
      const rShoulder = { x: 0.7, y: 0.4, z: 0 };
      // Right arm extends to the left in image (smaller x)
      const elbow = { x: 0.55, y: 0.4, z: 0 };
      const wrist = { x: 0.4, y: 0.4, z: 0 };
      const result = solveArm(rShoulder, elbow, wrist, false);
      expect(Math.abs(result.upperArmZ)).toBeLessThan(0.2);
    });
  });

  describe("upper arm forward/backward (X axis)", () => {
    it("arm at side (no depth): X is ~0", () => {
      const elbow = { x: 0.3, y: 0.6, z: 0 };
      const wrist = { x: 0.3, y: 0.8, z: 0 };
      const result = solveArm(shoulder, elbow, wrist, true);
      expect(Math.abs(result.upperArmX)).toBeLessThan(0.1);
    });

    it("arm reaching forward (negative Z): X is positive", () => {
      const elbow = { x: 0.3, y: 0.5, z: -0.2 }; // closer to camera
      const wrist = { x: 0.3, y: 0.6, z: -0.3 };
      const result = solveArm(shoulder, elbow, wrist, true);
      expect(result.upperArmX).toBeGreaterThan(0.3);
    });

    it("arm reaching backward (positive Z): X is negative", () => {
      const elbow = { x: 0.3, y: 0.5, z: 0.2 }; // away from camera
      const wrist = { x: 0.3, y: 0.6, z: 0.3 };
      const result = solveArm(shoulder, elbow, wrist, true);
      expect(result.upperArmX).toBeLessThan(-0.3);
    });
  });

  describe("lower arm bend (Y axis)", () => {
    it("straight arm: bend angle is small", () => {
      const elbow = { x: 0.3, y: 0.6, z: 0 };
      const wrist = { x: 0.3, y: 0.8, z: 0 }; // continues straight down
      const result = solveArm(shoulder, elbow, wrist, true);
      expect(Math.abs(result.lowerArmY)).toBeLessThan(0.3);
    });

    it("bent elbow: bend angle is significant", () => {
      const elbow = { x: 0.3, y: 0.6, z: 0 };
      const wrist = { x: 0.15, y: 0.6, z: 0 }; // 90 degrees to the left
      const result = solveArm(shoulder, elbow, wrist, true);
      expect(Math.abs(result.lowerArmY)).toBeGreaterThan(0.8);
    });

    it("elbow bend uses 3D vectors (z-axis bend)", () => {
      const elbow = { x: 0.3, y: 0.6, z: 0 };
      const wrist = { x: 0.3, y: 0.6, z: -0.2 }; // bent forward in Z
      const result = solveArm(shoulder, elbow, wrist, true);
      expect(Math.abs(result.lowerArmY)).toBeGreaterThan(0.8);
    });
  });

  describe("left vs right arm mirroring", () => {
    it("arm down: left Z positive, right Z negative", () => {
      const elbowDown = { x: 0.3, y: 0.6, z: 0 };
      const wristDown = { x: 0.3, y: 0.8, z: 0 };

      const left = solveArm(shoulder, elbowDown, wristDown, true);

      const rShoulder = { x: 0.7, y: 0.4, z: 0 };
      const rElbow = { x: 0.7, y: 0.6, z: 0 };
      const rWrist = { x: 0.7, y: 0.8, z: 0 };
      const right = solveArm(rShoulder, rElbow, rWrist, false);

      expect(left.upperArmZ).toBeGreaterThan(0);
      expect(right.upperArmZ).toBeLessThan(0);
    });

    it("same pose mirrors lowerArmY sign", () => {
      const elbow = { x: 0.3, y: 0.6, z: 0 };
      const wrist = { x: 0.15, y: 0.6, z: 0 };

      const left = solveArm(shoulder, elbow, wrist, true);
      const right = solveArm(shoulder, elbow, wrist, false);

      expect(Math.sign(left.lowerArmY)).not.toBe(Math.sign(right.lowerArmY));
    });
  });
});

describe("solveSpine", () => {
  const baseLeft = { x: 0.4, y: 0.4, z: 0 };
  const baseRight = { x: 0.6, y: 0.4, z: 0 };

  it("neutral pose: all rotations near zero", () => {
    const result = solveSpine(baseLeft, baseRight);
    expect(Math.abs(result.roll)).toBeLessThan(0.05);
    expect(Math.abs(result.yaw)).toBeLessThan(0.05);
    expect(result.pitch).toBe(0); // no hips provided
  });

  it("right shoulder higher: positive roll", () => {
    const rightUp = { x: 0.6, y: 0.3, z: 0 }; // y is lower = higher
    const result = solveSpine(baseLeft, rightUp);
    expect(result.roll).toBeLessThan(-0.03); // negative dy = right higher
  });

  it("left shoulder higher: negative roll", () => {
    const leftUp = { x: 0.4, y: 0.3, z: 0 };
    const result = solveSpine(leftUp, baseRight);
    expect(result.roll).toBeGreaterThan(0.03);
  });

  it("body turned right: positive yaw from depth difference", () => {
    const rightForward = { x: 0.6, y: 0.4, z: -0.1 }; // right shoulder closer
    const result = solveSpine(baseLeft, rightForward);
    // Right shoulder forward = negative dz → negative yaw
    expect(result.yaw).toBeLessThan(-0.05);
  });

  it("body turned left: negative yaw", () => {
    const leftForward = { x: 0.4, y: 0.4, z: -0.1 };
    const result = solveSpine(leftForward, baseRight);
    expect(result.yaw).toBeGreaterThan(0.05);
  });

  it("leaning forward: positive pitch when hips provided", () => {
    const leftHip = { x: 0.4, y: 0.7, z: 0 };
    const rightHip = { x: 0.6, y: 0.7, z: 0 };
    const leftShoulderForward = { x: 0.4, y: 0.4, z: -0.1 };
    const rightShoulderForward = { x: 0.6, y: 0.4, z: -0.1 };

    const result = solveSpine(leftShoulderForward, rightShoulderForward, leftHip, rightHip);
    expect(result.pitch).toBeLessThan(-0.05);
  });

  describe("increased range vs old implementation", () => {
    it("roll allows up to ±0.15 (was ±0.05)", () => {
      const bigTilt = { x: 0.6, y: 0.1, z: 0 }; // very tilted
      const result = solveSpine(baseLeft, bigTilt);
      expect(Math.abs(result.roll)).toBeGreaterThan(0.05);
      expect(Math.abs(result.roll)).toBeLessThanOrEqual(0.15);
    });

    it("yaw allows up to ±0.3 (was ±0.08)", () => {
      const bigTurn = { x: 0.6, y: 0.4, z: -0.5 };
      const result = solveSpine(baseLeft, bigTurn);
      expect(Math.abs(result.yaw)).toBeGreaterThan(0.08);
      expect(Math.abs(result.yaw)).toBeLessThanOrEqual(0.3);
    });
  });
});

describe("solveShoulder", () => {
  const hip = { x: 0.4, y: 0.65, z: 0 };

  beforeEach(() => {
    resetShoulderCalibration();
  });

  it("first call calibrates, returns near zero", () => {
    const shoulder = { x: 0.4, y: 0.4, z: 0 };
    const result = solveShoulder(shoulder, hip, true);
    // First call sets neutral baseline, so deviation is ~0
    expect(Math.abs(result.shoulderZ)).toBeLessThan(0.01);
  });

  it("shrugging after calibration: shoulderZ is negative for left", () => {
    // First call: calibrate at neutral
    const neutralShoulder = { x: 0.4, y: 0.4, z: 0 };
    solveShoulder(neutralShoulder, hip, true);

    // Second call: shoulder raised (closer to hip)
    const raisedShoulder = { x: 0.4, y: 0.5, z: 0 };
    const result = solveShoulder(raisedShoulder, hip, true);
    expect(result.shoulderZ).toBeLessThan(-0.05);
  });

  it("shrugging after calibration: shoulderZ is positive for right", () => {
    const rightHip = { x: 0.6, y: 0.65, z: 0 };
    // Calibrate
    solveShoulder({ x: 0.6, y: 0.4, z: 0 }, rightHip, false);
    // Shrug
    const result = solveShoulder({ x: 0.6, y: 0.5, z: 0 }, rightHip, false);
    expect(result.shoulderZ).toBeGreaterThan(0.05);
  });

  it("shoulder dropped: opposite sign", () => {
    // Calibrate
    solveShoulder({ x: 0.4, y: 0.4, z: 0 }, hip, true);
    // Drop shoulder (farther from hip)
    const result = solveShoulder({ x: 0.4, y: 0.3, z: 0 }, hip, true);
    expect(result.shoulderZ).toBeGreaterThan(0);
  });
});

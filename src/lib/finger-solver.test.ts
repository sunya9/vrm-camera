import { describe, expect, it } from "vitest";
import { computeCurl, computeSpread, solveHand, HAND_LANDMARKS } from "./finger-solver";

// Helper: create a straight line of 3 points along Y axis (straight finger pointing down)
function straightPoints() {
  return {
    parent: { x: 0, y: 0, z: 0 },
    current: { x: 0, y: 0.1, z: 0 },
    child: { x: 0, y: 0.2, z: 0 },
  };
}

// Helper: create a 90-degree bend in the XY plane
function bentPoints90() {
  return {
    parent: { x: 0, y: 0, z: 0 },
    current: { x: 0, y: 0.1, z: 0 },
    child: { x: 0.1, y: 0.1, z: 0 }, // 90 degree turn
  };
}

// Helper: create a 90-degree bend using Z axis (depth)
function bentPointsZ90() {
  return {
    parent: { x: 0, y: 0, z: 0 },
    current: { x: 0, y: 0.1, z: 0 },
    child: { x: 0, y: 0.1, z: 0.1 }, // 90 degree turn in Z
  };
}

describe("computeCurl", () => {
  it("returns ~0 for a straight finger", () => {
    const { parent, current, child } = straightPoints();
    const curl = computeCurl(parent, current, child);
    expect(curl).toBeCloseTo(0, 1);
  });

  it("returns ~PI/2 for a 90-degree bend in XY", () => {
    const { parent, current, child } = bentPoints90();
    const curl = computeCurl(parent, current, child);
    expect(curl).toBeCloseTo(Math.PI / 2, 1);
  });

  it("returns ~PI/2 for a 90-degree bend in Z axis", () => {
    const { parent, current, child } = bentPointsZ90();
    const curl = computeCurl(parent, current, child);
    expect(curl).toBeCloseTo(Math.PI / 2, 1);
  });

  it("detects curl regardless of hand orientation (rotated hand)", () => {
    // Rotate the bent points 45 degrees around Z axis
    const cos45 = Math.cos(Math.PI / 4);
    const sin45 = Math.sin(Math.PI / 4);

    // Straight finger rotated 45 degrees
    const straightCurl = computeCurl(
      { x: 0, y: 0, z: 0 },
      { x: -0.1 * sin45, y: 0.1 * cos45, z: 0 },
      { x: -0.2 * sin45, y: 0.2 * cos45, z: 0 },
    );
    expect(straightCurl).toBeCloseTo(0, 1);

    // Bent finger rotated - should still detect the bend
    const p = { x: 0, y: 0, z: 0 };
    const c = { x: -0.1 * sin45, y: 0.1 * cos45, z: 0 };
    // After the bend, the finger goes in a perpendicular direction (also rotated)
    const ch = {
      x: c.x + 0.1 * cos45,
      y: c.y + 0.1 * sin45,
      z: 0,
    };
    const bentCurl = computeCurl(p, c, ch);
    expect(bentCurl).toBeCloseTo(Math.PI / 2, 1);
  });

  it("returns ~PI for a fully folded finger (180-degree bend)", () => {
    const curl = computeCurl(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0.1, z: 0 },
      { x: 0, y: 0, z: 0 }, // folded back to parent position
    );
    expect(curl).toBeCloseTo(Math.PI, 1);
  });
});

describe("computeSpread", () => {
  it("returns ~0 when finger is parallel to middle finger", () => {
    const spread = computeSpread(
      { x: 0.05, y: 0, z: 0 }, // finger MCP
      { x: 0.05, y: 0.1, z: 0 }, // finger TIP
      { x: 0, y: 0, z: 0 }, // middle MCP
      { x: 0, y: 0.1, z: 0 }, // middle TIP
    );
    expect(spread).toBeCloseTo(0, 1);
  });

  it("returns positive angle for finger spread outward", () => {
    const spread = computeSpread(
      { x: 0.05, y: 0, z: 0 },
      { x: 0.15, y: 0.1, z: 0 }, // angled outward
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0.1, z: 0 },
    );
    expect(spread).not.toBeCloseTo(0, 1);
    expect(Math.abs(spread)).toBeGreaterThan(0.05);
  });
});

describe("solveHand", () => {
  // Generate a simple open hand landmark set (all fingers straight, pointing down)
  function makeOpenHand(): Array<{ x: number; y: number; z: number }> {
    const landmarks: Array<{ x: number; y: number; z: number }> = [];

    // Wrist
    landmarks[HAND_LANDMARKS.WRIST] = { x: 0.5, y: 0.6, z: 0 };

    // Thumb (spread to the side)
    landmarks[HAND_LANDMARKS.THUMB_CMC] = { x: 0.42, y: 0.55, z: 0 };
    landmarks[HAND_LANDMARKS.THUMB_MCP] = { x: 0.38, y: 0.5, z: 0 };
    landmarks[HAND_LANDMARKS.THUMB_IP] = { x: 0.35, y: 0.45, z: 0 };
    landmarks[HAND_LANDMARKS.THUMB_TIP] = { x: 0.32, y: 0.4, z: 0 };

    // Index (straight down)
    landmarks[HAND_LANDMARKS.INDEX_MCP] = { x: 0.44, y: 0.5, z: 0 };
    landmarks[HAND_LANDMARKS.INDEX_PIP] = { x: 0.44, y: 0.42, z: 0 };
    landmarks[HAND_LANDMARKS.INDEX_DIP] = { x: 0.44, y: 0.36, z: 0 };
    landmarks[HAND_LANDMARKS.INDEX_TIP] = { x: 0.44, y: 0.3, z: 0 };

    // Middle (straight down)
    landmarks[HAND_LANDMARKS.MIDDLE_MCP] = { x: 0.5, y: 0.48, z: 0 };
    landmarks[HAND_LANDMARKS.MIDDLE_PIP] = { x: 0.5, y: 0.4, z: 0 };
    landmarks[HAND_LANDMARKS.MIDDLE_DIP] = { x: 0.5, y: 0.34, z: 0 };
    landmarks[HAND_LANDMARKS.MIDDLE_TIP] = { x: 0.5, y: 0.28, z: 0 };

    // Ring (straight down)
    landmarks[HAND_LANDMARKS.RING_MCP] = { x: 0.56, y: 0.5, z: 0 };
    landmarks[HAND_LANDMARKS.RING_PIP] = { x: 0.56, y: 0.42, z: 0 };
    landmarks[HAND_LANDMARKS.RING_DIP] = { x: 0.56, y: 0.36, z: 0 };
    landmarks[HAND_LANDMARKS.RING_TIP] = { x: 0.56, y: 0.3, z: 0 };

    // Pinky (straight down)
    landmarks[HAND_LANDMARKS.PINKY_MCP] = { x: 0.6, y: 0.52, z: 0 };
    landmarks[HAND_LANDMARKS.PINKY_PIP] = { x: 0.6, y: 0.46, z: 0 };
    landmarks[HAND_LANDMARKS.PINKY_DIP] = { x: 0.6, y: 0.4, z: 0 };
    landmarks[HAND_LANDMARKS.PINKY_TIP] = { x: 0.6, y: 0.34, z: 0 };

    return landmarks;
  }

  // Make a peace sign: index + middle extended, ring + little + thumb curled
  function makePeaceSign(): Array<{ x: number; y: number; z: number }> {
    const lm = makeOpenHand();

    // Curl thumb: fold inward (TIP comes back toward palm)
    lm[HAND_LANDMARKS.THUMB_IP] = { x: 0.4, y: 0.52, z: 0 };
    lm[HAND_LANDMARKS.THUMB_TIP] = { x: 0.44, y: 0.54, z: 0 };

    // Curl ring: fold joints toward palm
    lm[HAND_LANDMARKS.RING_PIP] = { x: 0.56, y: 0.46, z: 0.03 };
    lm[HAND_LANDMARKS.RING_DIP] = { x: 0.56, y: 0.5, z: 0.05 };
    lm[HAND_LANDMARKS.RING_TIP] = { x: 0.56, y: 0.54, z: 0.04 };

    // Curl pinky: fold joints toward palm
    lm[HAND_LANDMARKS.PINKY_PIP] = { x: 0.6, y: 0.48, z: 0.03 };
    lm[HAND_LANDMARKS.PINKY_DIP] = { x: 0.6, y: 0.52, z: 0.05 };
    lm[HAND_LANDMARKS.PINKY_TIP] = { x: 0.6, y: 0.56, z: 0.04 };

    return lm;
  }

  it("open hand: all fingers have low curl at PIP and DIP joints", () => {
    const lm = makeOpenHand();
    const result = solveHand(lm);

    // MCP (joint 0) can have natural angle from wrist, but PIP/DIP should be straight
    for (const finger of ["index", "middle", "ring", "little"] as const) {
      expect(result[finger].curls[1]).toBeLessThan(0.3); // PIP
      expect(result[finger].curls[2]).toBeLessThan(0.3); // DIP
    }
  });

  it("peace sign: index and middle are extended, ring and little are curled", () => {
    const lm = makePeaceSign();
    const result = solveHand(lm);

    // Index and middle should be relatively straight
    const indexTotal = result.index.curls.reduce((a, b) => a + b, 0);
    const middleTotal = result.middle.curls.reduce((a, b) => a + b, 0);

    // Ring and little should be significantly curled
    const ringTotal = result.ring.curls.reduce((a, b) => a + b, 0);
    const littleTotal = result.little.curls.reduce((a, b) => a + b, 0);

    // Extended fingers have less total curl than curled fingers
    expect(indexTotal).toBeLessThan(ringTotal);
    expect(middleTotal).toBeLessThan(littleTotal);

    // Curled fingers should have meaningful curl
    expect(ringTotal).toBeGreaterThan(0.8);
    expect(littleTotal).toBeGreaterThan(0.8);
  });

  it("peace sign works even when hand is rotated in depth (z-axis curl)", () => {
    const lm = makePeaceSign();

    // Rotate hand orientation in depth - make ring/little curl into z
    lm[HAND_LANDMARKS.RING_PIP] = { x: 0.56, y: 0.46, z: 0.06 };
    lm[HAND_LANDMARKS.RING_DIP] = { x: 0.56, y: 0.49, z: 0.1 };
    lm[HAND_LANDMARKS.RING_TIP] = { x: 0.56, y: 0.52, z: 0.08 };

    const result = solveHand(lm);

    const indexTotal = result.index.curls.reduce((a, b) => a + b, 0);
    const ringTotal = result.ring.curls.reduce((a, b) => a + b, 0);

    // Ring should still be more curled than index even with z-axis bending
    expect(ringTotal).toBeGreaterThan(indexTotal);
  });

  it("solves all five fingers", () => {
    const lm = makeOpenHand();
    const result = solveHand(lm);

    expect(result.thumb).toBeDefined();
    expect(result.index).toBeDefined();
    expect(result.middle).toBeDefined();
    expect(result.ring).toBeDefined();
    expect(result.little).toBeDefined();

    // Each finger has 3 curl values
    for (const finger of ["thumb", "index", "middle", "ring", "little"] as const) {
      expect(result[finger].curls).toHaveLength(3);
    }
  });
});

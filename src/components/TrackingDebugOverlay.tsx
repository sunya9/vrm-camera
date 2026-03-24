import { useEffect, useState } from "react";
import type { TrackingResult } from "@/lib/face-tracker";

interface DebugData {
  face: {
    headPitch: number;
    headYaw: number;
    headRoll: number;
    blinkL: number;
    blinkR: number;
    jawOpen: number;
    smile: number;
  } | null;
  pose: {
    leftShoulder: string;
    rightShoulder: string;
    leftElbow: string;
    rightElbow: string;
    leftWrist: string;
    rightWrist: string;
  } | null;
  hands: Array<{
    side: string;
    gesture: string;
    score: number;
    wrist: string;
  }>;
}

function toDeg(rad: number): number {
  return Math.round(rad * (180 / Math.PI));
}

function fmtVec(lm: { x: number; y: number; z: number; visibility?: number }): string {
  const v = lm.visibility != null ? ` v${(lm.visibility * 100).toFixed(0)}%` : "";
  return `[${lm.x.toFixed(3)} ${lm.y.toFixed(3)} ${lm.z.toFixed(3)}]${v}`;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

function extractDebug(result: TrackingResult): DebugData {
  let face: DebugData["face"] = null;
  if (result.face?.faceLandmarks?.length) {
    const bs = result.face.faceBlendshapes?.[0]?.categories;
    const bsMap = new Map(bs?.map((c) => [c.categoryName, c.score]));
    const matrix = result.face.facialTransformationMatrixes?.[0];
    let headPitch = 0,
      headYaw = 0,
      headRoll = 0;
    if (matrix) {
      const m = matrix.data;
      headPitch = Math.atan2(-m[6], m[10]);
      headYaw = Math.asin(Math.max(-1, Math.min(1, m[2])));
      headRoll = Math.atan2(-m[1], m[0]);
    }
    face = {
      headPitch: toDeg(headPitch),
      headYaw: toDeg(headYaw),
      headRoll: toDeg(headRoll),
      blinkL: bsMap.get("eyeBlinkLeft") ?? 0,
      blinkR: bsMap.get("eyeBlinkRight") ?? 0,
      jawOpen: bsMap.get("jawOpen") ?? 0,
      smile: ((bsMap.get("mouthSmileLeft") ?? 0) + (bsMap.get("mouthSmileRight") ?? 0)) / 2,
    };
  }

  let pose: DebugData["pose"] = null;
  if (result.pose?.landmarks?.length) {
    const lm = result.pose.landmarks[0];
    if (lm.length >= 17) {
      pose = {
        leftShoulder: fmtVec(lm[11]),
        rightShoulder: fmtVec(lm[12]),
        leftElbow: fmtVec(lm[13]),
        rightElbow: fmtVec(lm[14]),
        leftWrist: fmtVec(lm[15]),
        rightWrist: fmtVec(lm[16]),
      };
    }
  }

  const hands: DebugData["hands"] = [];
  if (result.hands?.landmarks?.length) {
    for (let i = 0; i < result.hands.landmarks.length; i++) {
      const side = result.hands.handedness[i]?.[0]?.categoryName ?? "?";
      const gesture = result.hands.gestures?.[i]?.[0];
      const wrist = result.hands.landmarks[i][0];
      hands.push({
        side,
        gesture: gesture?.categoryName ?? "None",
        score: gesture?.score ?? 0,
        wrist: fmtVec(wrist),
      });
    }
  }

  return { face, pose, hands };
}

interface Props {
  resultRef: React.RefObject<TrackingResult | null>;
}

export function TrackingDebugOverlay({ resultRef }: Props) {
  const [data, setData] = useState<DebugData | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const result = resultRef.current;
      if (result) setData(extractDebug(result));
    }, 100);
    return () => clearInterval(id);
  }, [resultRef]);

  if (!data) return null;

  return (
    <div className="space-y-1 rounded bg-black/60 p-2 font-mono text-sm leading-tight text-white/90 backdrop-blur-sm">
      {data.face && (
        <div>
          <div className="text-white/50">Face</div>
          <div>
            head: P{data.face.headPitch}° Y{data.face.headYaw}° R{data.face.headRoll}°
          </div>
          <div>
            blink: L{pct(data.face.blinkL)} R{pct(data.face.blinkR)}
          </div>
          <div>
            jaw: {pct(data.face.jawOpen)} smile: {pct(data.face.smile)}
          </div>
        </div>
      )}
      {data.pose && (
        <div>
          <div className="text-white/50">Pose</div>
          <div>L肩 {data.pose.leftShoulder}</div>
          <div>L肘 {data.pose.leftElbow}</div>
          <div>L手 {data.pose.leftWrist}</div>
          <div>R肩 {data.pose.rightShoulder}</div>
          <div>R肘 {data.pose.rightElbow}</div>
          <div>R手 {data.pose.rightWrist}</div>
        </div>
      )}
      {data.hands.length > 0 && (
        <div>
          <div className="text-white/50">Hands</div>
          {data.hands.map((h, i) => (
            <div key={i}>
              {h.side}: {h.gesture} ({pct(h.score)}) wrist{h.wrist}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

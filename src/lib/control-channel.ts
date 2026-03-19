import type { LightingSettings } from "./vrm-scene";
import type { EffectSettings } from "./effects";
import type { LogEntry } from "./log-store";

const CHANNEL_NAME = "vrm-camera-controls";

export type ControlCommand =
  | { command: "requestState" }
  | { command: "toggleTracking" }
  | { command: "setMirror"; value: boolean }
  | { command: "setHandTracking"; value: boolean }
  | {
      command: "setBackground";
      value:
        | { type: "color"; color: string | null }
        | { type: "image"; url: string }
        | { type: "clear" };
    }
  | { command: "setLighting"; value: LightingSettings }
  | { command: "setShowLightHelper"; value: boolean }
  | { command: "setEffects"; value: EffectSettings }
  | { command: "setRemoteLightTab"; value: boolean }
  | { command: "triggerExpression"; value: string }
  | { command: "resetPose" }
  | { command: "resetCamera" }
  | { command: "loadVRM" };

export type ControlMessage =
  | { type: "state"; state: ControlState }
  | ({ type: "command" } & ControlCommand);

export interface ControlState {
  tracking: boolean;
  handTracking: boolean;
  mirror: boolean;
  showControls: boolean;
  bgColor: string | null;
  bgImage: string | null;
  lighting: LightingSettings;
  effects: EffectSettings;
  showLightHelper: boolean;
  activeExpression: string | null;
  status: string;
  vrmName: string | null;
  fps: number;
  logs: LogEntry[];
}

export function createControlChannel(onMessage: (msg: ControlMessage) => void): {
  send: (msg: ControlMessage) => void;
  close: () => void;
} {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (e: MessageEvent<ControlMessage>) => {
    onMessage(e.data);
  };
  return {
    send: (msg) => channel.postMessage(msg),
    close: () => channel.close(),
  };
}

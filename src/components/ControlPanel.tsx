import { useEffect, useState, useCallback, useRef } from "react";
import {
  createControlChannel,
  type ControlState,
  type ControlCommand,
  type ControlMessage,
} from "@/lib/control-channel";
import { DEFAULT_LIGHTING } from "@/lib/vrm-scene";
import { DEFAULT_EFFECTS } from "@/lib/effects";
import { ControlTabs } from "./ControlTabs";
import { isTauri } from "@/lib/platform";

const INITIAL_STATE: ControlState = {
  tracking: false,
  handTracking: true,
  mirror: true,
  showControls: true,
  bgColor: null,
  bgImage: null,
  lighting: DEFAULT_LIGHTING,
  effects: DEFAULT_EFFECTS,
  showLightHelper: true,
  activeExpression: null,
  status: "接続待ち...",
  vrmName: null,
  fps: 0,
  logs: [],
};

export function ControlPanel() {
  const [state, setState] = useState<ControlState>(INITIAL_STATE);
  const [activeTab, setActiveTab] = useState("controls");

  const channelRef = useRef<ReturnType<typeof createControlChannel> | null>(null);

  useEffect(() => {
    const ch = createControlChannel((msg: ControlMessage) => {
      if (msg.type === "state") {
        setState(msg.state);
      }
    });
    channelRef.current = ch;
    ch.send({ type: "command", command: "requestState" });
    return () => ch.close();
  }, []);

  const sendCommand = useCallback((cmd: ControlCommand) => {
    channelRef.current?.send({ type: "command", ...cmd });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ControlTabs
        vrmName={state.vrmName}
        fps={state.fps}
        tracking={state.tracking}
        handTracking={state.handTracking}
        mirror={state.mirror}
        bgColor={state.bgColor}
        bgImage={state.bgImage}
        lighting={state.lighting}
        showLightHelper={state.showLightHelper}
        effects={state.effects}
        activeExpression={state.activeExpression}
        logs={state.logs}
        activeTab={activeTab}
        onVRMUpload={() => sendCommand({ command: "loadVRM" })}
        onToggleTracking={() => sendCommand({ command: "toggleTracking" })}
        onSetMirror={(v) => sendCommand({ command: "setMirror", value: v })}
        onSetHandTracking={(v) => sendCommand({ command: "setHandTracking", value: v })}
        onSetBackground={(change) => sendCommand({ command: "setBackground", value: change })}
        onSetLighting={(v) => sendCommand({ command: "setLighting", value: v })}
        onSetShowLightHelper={(v) => sendCommand({ command: "setShowLightHelper", value: v })}
        onSetEffects={(v) => sendCommand({ command: "setEffects", value: v })}
        onTriggerExpression={(name) => sendCommand({ command: "triggerExpression", value: name })}
        onResetPose={() => sendCommand({ command: "resetPose" })}
        onResetCamera={() => sendCommand({ command: "resetCamera" })}
        isDetached
        onOpenControlPanel={async () => {
          if (isTauri) {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().close();
          } else {
            window.close();
          }
        }}
        onTabChange={(tab) => {
          setActiveTab(tab);
          sendCommand({ command: "setRemoteLightTab", value: tab === "lighting" });
        }}
      />
    </div>
  );
}

import { useEffect, useRef, useCallback, useState, useEffectEvent } from "react";
import { createFaceTracker, setupWebcam, type FaceTracker } from "@/lib/face-tracker";
import { resetAnimatorState } from "@/lib/vrm-animator";
import { cacheVRM, loadCachedVRM } from "@/lib/vrm-cache";
import { usePersistedState } from "@/lib/use-persisted-state";
import { createControlChannel } from "@/lib/control-channel";
import { useLogStore } from "@/lib/log-store";
import { DEFAULT_LIGHTING, type LightingSettings } from "@/lib/vrm-scene";
import { DEFAULT_EFFECTS, type EffectSettings } from "@/lib/effects";
import { cn } from "@/lib/utils";
import { VRMCanvas } from "./VRMCanvas";
import { DEFAULT_CAMERA, type CameraState } from "@/lib/camera";
import { ControlTabs } from "./ControlTabs";
import { Spinner } from "@/components/ui/spinner";
import type { VRM } from "@pixiv/three-vrm";
import { isTauri } from "@/lib/platform";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export function VRMViewer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const [activeTracker, setActiveTracker] = useState<FaceTracker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const expressionOverridesRef = useRef<Record<string, number>>({});
  const expressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetCameraRef = useRef<(() => void) | null>(null);

  const [vrmUrl, setVrmUrl] = useState<string | null>(null);
  const [vrmName, setVrmName] = useState<string | null>(null);
  const [tracking, setTracking] = usePersistedState("tracking", false);
  const [handTracking, setHandTracking] = usePersistedState("handTracking", true);
  const [mirror, setMirror] = usePersistedState("mirror", true);
  const [showControls, setShowControls] = useState(true);
  const [activeTab, setActiveTab] = usePersistedState("activeTab", "controls");
  const [bgColor, setBgColor] = usePersistedState<string | null>("bgColor", null);
  const [bgImage, setBgImage] = usePersistedState<string | null>("bgImage", null);
  const [activeExpression, setActiveExpression] = useState<string | null>(null);
  const [lighting, setLighting] = usePersistedState<LightingSettings>("lighting", DEFAULT_LIGHTING);
  const [effects, setEffects] = usePersistedState<EffectSettings>("effects", DEFAULT_EFFECTS);
  const [cameraState, setCameraState] = usePersistedState<CameraState>("camera", DEFAULT_CAMERA);
  const [showLightHelper, setShowLightHelper] = usePersistedState("showLightHelper", true);
  const [remoteLightTab, setRemoteLightTab] = useState(false);
  const isOnLightTab = (activeTab === "lighting" && showControls) || remoteLightTab;
  const computedShowLightHelper = isOnLightTab && showLightHelper;
  const [vrmLoading, setVrmLoading] = useState(false);
  const [fps, setFps] = useState(0);

  const { logs, addLog } = useLogStore();
  const log = useEffectEvent(addLog);

  // FPS counter
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let rafId: number;
    function loop() {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastTime = now;
      }
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Load cached VRM
  useEffect(() => {
    log("初期化中...");
    loadCachedVRM()
      .then((cached) => {
        if (cached) {
          log(`キャッシュから読込中: ${cached.fileName}`);
          setVrmUrl(cached.url);
          setVrmName(cached.fileName);
        } else {
          log("VRMファイルを選択してください");
        }
      })
      .catch(() => log("VRMファイルを選択してください"));
  }, []);

  const onVRMLoaded = useCallback(
    (vrm: VRM) => {
      vrmRef.current = vrm;
      addLog("VRMロード完了");
    },
    [addLog],
  );

  // Initialize tracker (only recreate when handTracking changes)
  useEffect(() => {
    let cancelled = false;
    log("トラッカー初期化中...");

    createFaceTracker({ enableHands: handTracking }).then((tracker) => {
      if (cancelled) {
        tracker.dispose();
        return;
      }
      trackerRef.current?.dispose();
      trackerRef.current = tracker;
      setActiveTracker(tracker);
      log(`トラッカー準備完了 (指: ${handTracking ? "ON" : "OFF"})`);
    });

    return () => {
      cancelled = true;
      trackerRef.current?.dispose();
      trackerRef.current = null;
      setActiveTracker(null);
    };
  }, [handTracking]);

  // Camera start/stop (tracker is managed separately)
  useEffect(() => {
    if (!tracking) return;
    let cancelled = false;

    async function startCamera() {
      const video = videoRef.current!;
      if (!video) return;
      log("カメラ起動中...");
      try {
        const stream = await setupWebcam(video);
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        log("カメラ起動成功");
      } catch {
        if (cancelled) return;
        log("カメラへのアクセスが拒否されました");
        setTracking(false);
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
        streamRef.current = null;
      }
      log("カメラ停止");
    };
  }, [tracking, setTracking]);

  // BroadcastChannel
  const channelRef = useRef<ReturnType<typeof createControlChannel> | null>(null);

  const triggerExpression = useCallback(
    (name: string, duration = 2000) => {
      if (expressionTimerRef.current) clearTimeout(expressionTimerRef.current);

      const vrm = vrmRef.current;

      // Clear previous overrides (reset to 0 only if not tracking)
      if (!tracking && vrm?.expressionManager) {
        for (const prevName of Object.keys(expressionOverridesRef.current)) {
          vrm.expressionManager.setValue(prevName, 0);
        }
      }

      // Set new expression override
      expressionOverridesRef.current = { [name]: 1.0 };
      setActiveExpression(name);
      if (vrm?.expressionManager) vrm.expressionManager.setValue(name, 1.0);

      expressionTimerRef.current = setTimeout(() => {
        expressionOverridesRef.current = {};
        setActiveExpression(null);
        // Only force reset if not tracking — tracking will naturally overwrite
        if (!tracking && vrm?.expressionManager) {
          vrm.expressionManager.setValue(name, 0);
        }
      }, duration);
    },
    [tracking],
  );

  useEffect(() => {
    const ch = createControlChannel((msg) => {
      if (msg.type !== "command") return;
      switch (msg.command) {
        case "toggleTracking":
          setTracking((v: boolean) => !v);
          break;
        case "setMirror":
          setMirror(msg.value);
          break;
        case "setHandTracking":
          setHandTracking(msg.value);
          break;
        case "setBackground":
          if (msg.value.type === "color") {
            setBgColor(msg.value.color);
            setBgImage(null);
          } else if (msg.value.type === "image") {
            setBgImage(msg.value.url);
            setBgColor(null);
          } else {
            setBgColor(null);
            setBgImage(null);
          }
          break;
        case "setLighting":
          setLighting(msg.value);
          break;
        case "setShowLightHelper":
          setShowLightHelper(msg.value);
          break;
        case "setEffects":
          setEffects(msg.value);
          break;
        case "setRemoteLightTab":
          setRemoteLightTab(msg.value);
          break;
        case "triggerExpression":
          triggerExpression(msg.value);
          break;
        case "resetPose":
          resetAnimatorState();
          addLog("ポーズをリセット");
          break;
        case "resetCamera":
          resetCameraRef.current?.();
          addLog("カメラ位置をリセット");
          break;
      }
    });
    channelRef.current = ch;
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [
    setTracking,
    setMirror,
    setHandTracking,
    setBgColor,
    setBgImage,
    setLighting,
    setShowLightHelper,
    setEffects,
    addLog,
    triggerExpression,
  ]);

  // Broadcast full state whenever it changes
  const broadcastState = useCallback(() => {
    channelRef.current?.send({
      type: "state",
      state: {
        tracking,
        handTracking,
        mirror,
        showControls,
        bgColor,
        bgImage,
        lighting,
        effects,
        showLightHelper,
        activeExpression,
        status: logs[logs.length - 1]?.message ?? "",
        vrmName,
        fps,
        logs,
      },
    });
  }, [
    tracking,
    handTracking,
    mirror,
    showControls,
    bgColor,
    bgImage,
    lighting,
    effects,
    showLightHelper,
    activeExpression,
    logs,
    vrmName,
    fps,
  ]);

  useEffect(() => {
    broadcastState();
    const intervalId = setInterval(broadcastState, 1000);
    return () => clearInterval(intervalId);
  }, [broadcastState]);

  const handleVRMUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      addLog(`VRMロード中: ${file.name}`);
      const url = URL.createObjectURL(file);
      try {
        await cacheVRM(file);
        setVrmUrl(url);
        setVrmName(file.name);
      } catch (err) {
        addLog(`VRMロード失敗: ${err}`);
      }
    },
    [addLog],
  );

  // Esc to toggle controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowControls((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const controlWindowRef = useRef<Window | null>(null);
  const tauriWindowRef = useRef<WebviewWindow>(null);

  const openControlPanel = useCallback(async () => {
    // If already open, close and re-integrate
    if (controlWindowRef.current && !controlWindowRef.current.closed) {
      controlWindowRef.current.close();
      controlWindowRef.current = null;
      setShowControls(true);
      return;
    }
    if (tauriWindowRef.current) {
      try {
        await tauriWindowRef.current.close();
      } catch {
        /* ignore */
      }
      tauriWindowRef.current = null;
      setShowControls(true);
      return;
    }

    if (isTauri) {
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const controlWin = new WebviewWindow("controls", {
          url: "/#/controls",
          title: "VRM Camera Controls",
          width: 720,
          height: 350,
          resizable: true,
        });
        // Wait for the window to be created before hiding controls
        await controlWin.once("tauri://created", () => {});
        tauriWindowRef.current = controlWin;
        setShowControls(false);

        // Listen for window destruction (not close-requested, which can be cancelled)
        controlWin.listen("tauri://destroyed", () => {
          tauriWindowRef.current = null;
          setRemoteLightTab(false);
          setShowControls(true);
        });
      } catch (err) {
        addLog(`コントロールウィンドウの作成に失敗: ${err}`);
      }
    } else {
      const win = window.open(
        "/#/controls",
        "vrm-camera-controls",
        "width=720,height=350,resizable=yes",
      );
      if (!win) return;
      controlWindowRef.current = win;
      setShowControls(false);

      const onClose = () => {
        if (controlWindowRef.current?.location.href === "about:blank") return;
        controlWindowRef.current = null;
        setRemoteLightTab(false);
        setShowControls(true);
      };
      win.addEventListener("unload", onClose);
    }
  }, [addLog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (controlWindowRef.current && !controlWindowRef.current.closed) {
        controlWindowRef.current.close();
      }
      if (tauriWindowRef.current) {
        try {
          tauriWindowRef.current.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const handleResetPose = useCallback(() => {
    resetAnimatorState();
    addLog("ポーズをリセット");
  }, [addLog]);
  const handleResetCamera = useCallback(() => {
    resetCameraRef.current?.();
    addLog("カメラ位置をリセット");
  }, [addLog]);
  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-background text-foreground select-none"
      onPointerDown={(e) => {
        pointerDownPos.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (!pointerDownPos.current) return;
        const dx = e.clientX - pointerDownPos.current.x;
        const dy = e.clientY - pointerDownPos.current.y;
        if (dx * dx + dy * dy < 25) setShowControls((v) => !v);
        pointerDownPos.current = null;
      }}
    >
      <div className="absolute inset-0">
        <VRMCanvas
          vrmUrl={vrmUrl}
          tracker={activeTracker}
          videoRef={videoRef}
          mirror={mirror}
          lighting={lighting}
          showLightHelper={computedShowLightHelper}
          bgColor={bgColor}
          bgImage={bgImage}
          effects={effects}
          cameraState={cameraState}
          onCameraChange={setCameraState}
          expressionOverrides={expressionOverridesRef.current}
          onVRMLoaded={onVRMLoaded}
          onVRMLoadingChange={setVrmLoading}
          onResetCamera={resetCameraRef}
        />
      </div>

      {/* Loading indicator */}
      {vrmLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
          <div className="flex flex-col items-center gap-2">
            <Spinner className="size-8 text-white" />
            <span className="text-sm text-white/80">VRMロード中...</span>
          </div>
        </div>
      )}

      <video ref={videoRef} className="absolute -left-full h-px w-px" playsInline muted />

      <ControlTabs
        vrmName={vrmName}
        fps={fps}
        tracking={tracking}
        handTracking={handTracking}
        mirror={mirror}
        bgColor={bgColor}
        bgImage={bgImage}
        lighting={lighting}
        showLightHelper={showLightHelper}
        activeExpression={activeExpression}
        logs={logs}
        onVRMUpload={handleVRMUpload}
        onToggleTracking={() => setTracking((v: boolean) => !v)}
        onSetMirror={setMirror}
        onSetHandTracking={setHandTracking}
        onSetBackground={(change) => {
          if (change.type === "color") {
            setBgColor(change.color);
            setBgImage(null);
          } else if (change.type === "image") {
            setBgImage(change.url);
            setBgColor(null);
          } else {
            setBgColor(null);
            setBgImage(null);
          }
        }}
        onSetLighting={setLighting}
        onSetShowLightHelper={setShowLightHelper}
        effects={effects}
        onSetEffects={setEffects}
        onTriggerExpression={triggerExpression}
        onResetPose={handleResetPose}
        onResetCamera={handleResetCamera}
        activeTab={activeTab}
        onOpenControlPanel={openControlPanel}
        onTabChange={setActiveTab}
        className={cn(
          "absolute right-0 bottom-0 left-0 z-20 border-t border-border bg-background/80 shadow-lg backdrop-blur-md transition-transform duration-200 ease-out",
          {
            "translate-y-0": showControls,
            "translate-y-full": !showControls,
          },
        )}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      />
    </div>
  );
}

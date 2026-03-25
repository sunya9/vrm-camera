import { useEffect, useRef, useCallback, useReducer, useEffectEvent } from "react";
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
import type { GestureEvent } from "./VRMModel";
import { TrackingDebugOverlay } from "./TrackingDebugOverlay";
import type { TrackingResult } from "@/lib/face-tracker";
import { DEFAULT_CAMERA, type CameraState } from "@/lib/camera";
import { ControlTabs } from "./ControlTabs";
import { Spinner } from "@/components/ui/spinner";
import type { VRM } from "@pixiv/three-vrm";
import { isTauri, CONTROLS_URL } from "@/lib/platform";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { viewerReducer, initialViewerState } from "@/lib/viewer-reducer";

export function VRMViewer() {
  const [state, dispatch] = useReducer(viewerReducer, initialViewerState);
  const {
    activeTracker,
    vrmUrl,
    vrmName,
    showControls,
    activeExpression,
    remoteLightTab,
    vrmLoading,
    fps,
  } = state;

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const expressionOverridesRef = useRef<Record<string, number>>({});
  const expressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetCameraRef = useRef<(() => void) | null>(null);
  const trackingResultRef = useRef<TrackingResult | null>(null);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const controlWindowRef = useRef<Window | null>(null);
  const tauriWindowRef = useRef<WebviewWindow>(null);
  const channelRef = useRef<ReturnType<typeof createControlChannel> | null>(null);

  // Persisted state
  const [tracking, setTracking] = usePersistedState("tracking", false);
  const [handTracking, setHandTracking] = usePersistedState("handTracking", true);
  const [mirror, setMirror] = usePersistedState("mirror", true);
  const [activeTab, setActiveTab] = usePersistedState("activeTab", "controls");
  const [bgColor, setBgColor] = usePersistedState<string | null>("bgColor", null);
  const [bgImage, setBgImage] = usePersistedState<string | null>("bgImage", null);
  const [lighting, setLighting] = usePersistedState<LightingSettings>("lighting", DEFAULT_LIGHTING);
  const [effects, setEffects] = usePersistedState<EffectSettings>("effects", DEFAULT_EFFECTS);
  const [cameraState, setCameraState] = usePersistedState<CameraState>("camera", DEFAULT_CAMERA);
  const [showLightHelper, setShowLightHelper] = usePersistedState("showLightHelper", true);
  const [showColliderHelper, setShowColliderHelper] = usePersistedState(
    "showColliderHelper",
    false,
  );
  const [showBoneHelper, setShowBoneHelper] = usePersistedState("showBoneHelper", false);
  const [headColliderScale, setHeadColliderScale] = usePersistedState("headColliderScale", 1.5);
  const [hairStiffnessScale, setHairStiffnessScale] = usePersistedState("hairStiffnessScale", 1.0);
  const [showDebug, setShowDebug] = usePersistedState("showDebug", false);

  // Derived
  const isOnLightTab = (activeTab === "lighting" && showControls) || remoteLightTab;
  const computedShowLightHelper = isOnLightTab && showLightHelper;

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
        dispatch({ type: "setFps", fps: frameCount });
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
          dispatch({ type: "setVrm", url: cached.url, name: cached.fileName });
        } else {
          log("VRMファイルを選択してください");
        }
      })
      .catch(() => log("VRMファイルを選択してください"));
  }, []);

  const onVRMLoaded = useCallback(
    (vrm: VRM) => {
      vrmRef.current = vrm;
      const meta = vrm.meta;
      const vrmVersion = meta.metaVersion === "0" ? "VRM 0.x" : "VRM 1.0";
      const modelName = "name" in meta ? (meta.name ?? "不明") : "不明";
      const modelVersion = meta.version ?? "";
      addLog(`VRMロード完了: ${modelName} ${modelVersion} (${vrmVersion})`);

      // Debug: log thumb bone rest orientation
      const thumbMeta = vrm.humanoid.getNormalizedBoneNode("leftThumbMetacarpal");
      const thumbProx = vrm.humanoid.getNormalizedBoneNode("leftThumbProximal");
      if (thumbMeta && thumbProx) {
        const mp = thumbMeta.position;
        const pp = thumbProx.position;
        addLog(`親指Meta pos:[${mp.x.toFixed(3)},${mp.y.toFixed(3)},${mp.z.toFixed(3)}]`);
        addLog(`親指Prox pos:[${pp.x.toFixed(3)},${pp.y.toFixed(3)},${pp.z.toFixed(3)}]`);
        const dir = pp.clone().sub(mp).normalize();
        addLog(`親指ボーン方向:[${dir.x.toFixed(3)},${dir.y.toFixed(3)},${dir.z.toFixed(3)}]`);
      }
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
      dispatch({ type: "setActiveTracker", tracker });
      log(`トラッカー準備完了 (指: ${handTracking ? "ON" : "OFF"})`);
    });

    return () => {
      cancelled = true;
      trackerRef.current?.dispose();
      trackerRef.current = null;
      dispatch({ type: "setActiveTracker", tracker: null });
    };
  }, [handTracking]);

  // Camera start/stop
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

  // Expression trigger
  const triggerExpression = useCallback(
    (name: string, duration = 2000) => {
      if (expressionTimerRef.current) clearTimeout(expressionTimerRef.current);

      const vrm = vrmRef.current;

      if (!tracking && vrm?.expressionManager) {
        for (const prevName of Object.keys(expressionOverridesRef.current)) {
          vrm.expressionManager.setValue(prevName, 0);
        }
      }

      expressionOverridesRef.current = { [name]: 1.0 };
      dispatch({ type: "setActiveExpression", name });
      if (vrm?.expressionManager) vrm.expressionManager.setValue(name, 1.0);

      expressionTimerRef.current = setTimeout(() => {
        expressionOverridesRef.current = {};
        dispatch({ type: "setActiveExpression", name: null });
        if (!tracking && vrm?.expressionManager) {
          vrm.expressionManager.setValue(name, 0);
        }
      }, duration);
    },
    [tracking],
  );

  // BroadcastChannel
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
        case "setShowColliderHelper":
          setShowColliderHelper(msg.value);
          break;
        case "setShowBoneHelper":
          setShowBoneHelper(msg.value);
          break;
        case "setHeadColliderScale":
          setHeadColliderScale(msg.value);
          break;
        case "setHairStiffnessScale":
          setHairStiffnessScale(msg.value);
          break;
        case "setEffects":
          setEffects(msg.value);
          break;
        case "setRemoteLightTab":
          dispatch({ type: "setRemoteLightTab", active: msg.value });
          break;
        case "triggerExpression":
          triggerExpression(msg.value);
          break;
        case "resetPose":
          resetAnimatorState(vrmRef.current ?? undefined);
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
    setShowColliderHelper,
    setShowBoneHelper,
    setHeadColliderScale,
    setHairStiffnessScale,
    setEffects,
    addLog,
    triggerExpression,
  ]);

  const handleVRMLoadingChange = useCallback(
    (loading: boolean) => dispatch({ type: "setVrmLoading", loading }),
    [],
  );

  // Broadcast full state
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
        showColliderHelper,
        showBoneHelper,
        headColliderScale,
        hairStiffnessScale,
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
    showColliderHelper,
    showBoneHelper,
    headColliderScale,
    hairStiffnessScale,
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

  // VRM upload
  const handleVRMUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      addLog(`VRMロード中: ${file.name}`);
      const url = URL.createObjectURL(file);
      try {
        await cacheVRM(file);
        dispatch({ type: "setVrm", url, name: file.name });
      } catch (err) {
        addLog(`VRMロード失敗: ${err}`);
      }
    },
    [addLog],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "toggleControls" });
      if (e.key === "d" || e.key === "D") setShowDebug((v: boolean) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setShowDebug]);

  // Control panel window
  const openControlPanel = useCallback(async () => {
    if (controlWindowRef.current && !controlWindowRef.current.closed) {
      controlWindowRef.current.close();
      controlWindowRef.current = null;
      dispatch({ type: "setShowControls", show: true });
      return;
    }
    if (tauriWindowRef.current) {
      try {
        await tauriWindowRef.current.close();
      } catch {
        /* ignore */
      }
      tauriWindowRef.current = null;
      dispatch({ type: "setShowControls", show: true });
      return;
    }

    if (isTauri) {
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const controlWin = new WebviewWindow("controls", {
          url: CONTROLS_URL,
          title: "VRM Camera Controls",
          width: 720,
          height: 350,
          resizable: true,
        });
        await controlWin.once("tauri://created", () => {});
        tauriWindowRef.current = controlWin;
        dispatch({ type: "setShowControls", show: false });

        controlWin.listen("tauri://destroyed", () => {
          tauriWindowRef.current = null;
          dispatch({ type: "setRemoteLightTab", active: false });
          dispatch({ type: "setShowControls", show: true });
        });
      } catch (err) {
        addLog(`コントロールウィンドウの作成に失敗: ${err}`);
      }
    } else {
      const win = window.open(
        CONTROLS_URL,
        "vrm-camera-controls",
        "width=720,height=350,resizable=yes",
      );
      if (!win) return;
      controlWindowRef.current = win;
      dispatch({ type: "setShowControls", show: false });

      const onClose = () => {
        if (controlWindowRef.current?.location.href === "about:blank") return;
        controlWindowRef.current = null;
        dispatch({ type: "setRemoteLightTab", active: false });
        dispatch({ type: "setShowControls", show: true });
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

  const handleResetPose = useCallback(() => {
    resetAnimatorState(vrmRef.current ?? undefined);
    addLog("ポーズをリセット");
  }, [addLog]);

  const handleResetCamera = useCallback(() => {
    resetCameraRef.current?.();
    addLog("カメラ位置をリセット");
  }, [addLog]);

  const handleGestureChange = useCallback(
    (gestures: GestureEvent[]) => {
      const desc = gestures
        .map((g) => `${g.hand}: ${g.gesture} (${(g.score * 100).toFixed(0)}%)`)
        .join(", ");
      addLog(`ジェスチャー検出: ${desc}`);
    },
    [addLog],
  );

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
        if (dx * dx + dy * dy < 25) dispatch({ type: "toggleControls" });
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
          onVRMLoadingChange={handleVRMLoadingChange}
          onResetCamera={resetCameraRef}
          onGestureChange={handleGestureChange}
          onTrackingResult={
            showDebug
              ? (r) => {
                  trackingResultRef.current = r;
                }
              : undefined
          }
          showColliderHelper={showColliderHelper}
          showBoneHelper={showBoneHelper}
          headColliderScale={headColliderScale}
          hairStiffnessScale={hairStiffnessScale}
        />
      </div>

      {vrmLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
          <div className="flex flex-col items-center gap-2">
            <Spinner className="size-8 text-white" />
            <span className="text-sm text-white/80">VRMロード中...</span>
          </div>
        </div>
      )}

      <video ref={videoRef} className="absolute -left-full h-px w-px" playsInline muted />

      {showDebug && (
        <div className="absolute top-2 left-2 z-30">
          <TrackingDebugOverlay resultRef={trackingResultRef} />
        </div>
      )}

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
        showColliderHelper={showColliderHelper}
        headColliderScale={headColliderScale}
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
        onSetShowColliderHelper={setShowColliderHelper}
        showBoneHelper={showBoneHelper}
        onSetShowBoneHelper={setShowBoneHelper}
        onSetHeadColliderScale={setHeadColliderScale}
        hairStiffnessScale={hairStiffnessScale}
        onSetHairStiffnessScale={setHairStiffnessScale}
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
        showControls={showControls}
      />
    </div>
  );
}

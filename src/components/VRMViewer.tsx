import { useEffect, useRef, useCallback, useState } from "react";
import {
  createVRMScene,
  loadVRM,
  renderFrame,
  resizeRenderer,
  setBackground,
  type VRMScene,
} from "../lib/vrm-scene";
import {
  createFaceTracker,
  setupWebcam,
  type FaceTracker,
} from "../lib/face-tracker";
import { applyTracking } from "../lib/vrm-animator";
import { cacheVRM, loadCachedVRM } from "../lib/vrm-cache";

const BG_PRESETS = [
  { label: "透過", value: null },
  { label: "緑", value: "#00b140" },
  { label: "青", value: "#0047ab" },
  { label: "黒", value: "#000000" },
  { label: "白", value: "#ffffff" },
  { label: "グレー", value: "#808080" },
];

export function VRMViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const vrmSceneRef = useRef<VRMScene | null>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const animationIdRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState("初期化中...");
  const [vrmName, setVrmName] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [handTracking, setHandTracking] = useState(true);
  const [mirror, setMirror] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [bgColor, setBgColor] = useState<string | null>(null);
  const [fps, setFps] = useState(0);

  // Initialize Three.js scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const vrmScene = createVRMScene(canvas);
    vrmSceneRef.current = vrmScene;

    loadCachedVRM()
      .then((cached) => {
        if (cached) {
          setStatus(`キャッシュから読込中: ${cached.fileName}`);
          return loadVRM(vrmScene, cached.url).then(() => {
            setVrmName(cached.fileName);
            setStatus(`VRMロード完了: ${cached.fileName}`);
          });
        }
        setStatus("VRMファイルを選択してください");
      })
      .catch(() => setStatus("VRMファイルを選択してください"));

    const onResize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) resizeRenderer(vrmScene, rect.width, rect.height);
    };
    window.addEventListener("resize", onResize);

    let frameCount = 0;
    let lastFpsTime = performance.now();
    function loop() {
      renderFrame(vrmScene);
      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsTime = now;
      }
      animationIdRef.current = requestAnimationFrame(loop);
    }
    animationIdRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animationIdRef.current);
      vrmScene.dispose();
    };
  }, []);

  // Apply background color
  useEffect(() => {
    if (vrmSceneRef.current) {
      setBackground(vrmSceneRef.current, bgColor);
    }
  }, [bgColor]);

  // Tracking loop
  useEffect(() => {
    if (!tracking) return;
    let running = true;

    async function startTracking() {
      const video = videoRef.current!;
      if (!video) return;

      setStatus("カメラ起動中...");
      try {
        const stream = await setupWebcam(video);
        streamRef.current = stream;
      } catch {
        setStatus("カメラへのアクセスが拒否されました");
        setTracking(false);
        return;
      }

      setStatus("トラッカー初期化中...");
      const tracker = await createFaceTracker({ enableHands: handTracking });
      trackerRef.current = tracker;
      setStatus("トラッキング中");

      function trackLoop() {
        if (!running) return;
        const vrmScene = vrmSceneRef.current;
        if (vrmScene?.vrm && video.readyState >= 2) {
          const result = tracker.detect(video);
          applyTracking(vrmScene.vrm, result);
        }
        requestAnimationFrame(trackLoop);
      }
      requestAnimationFrame(trackLoop);
    }

    startTracking();

    return () => {
      running = false;
      trackerRef.current?.dispose();
      trackerRef.current = null;
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
        streamRef.current = null;
      }
    };
  }, [tracking, handTracking]);

  const handleVRMUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !vrmSceneRef.current) return;
      setStatus("VRMロード中...");
      const url = URL.createObjectURL(file);
      try {
        await loadVRM(vrmSceneRef.current, url);
        setStatus(`キャッシュ中: ${file.name}`);
        await cacheVRM(file);
        setVrmName(file.name);
        setStatus(`VRMロード完了: ${file.name}`);
      } catch (err) {
        setStatus(`VRMロード失敗: ${err}`);
      }
    },
    [],
  );

  // Toggle controls with Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowControls((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#1a1a2e] text-gray-200 font-sans select-none">
      {/* Viewer */}
      <div className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="block w-full h-full"
          style={{ transform: mirror ? "scaleX(-1)" : undefined }}
        />
        <video
          ref={videoRef}
          className={`absolute bottom-3 right-3 w-48 h-36 rounded-lg object-cover border-2 border-white/20 -scale-x-100 ${
            showPreview ? "block" : "hidden"
          }`}
          playsInline
          muted
        />

        {/* Floating toggle for controls */}
        {!showControls && (
          <button
            type="button"
            onClick={() => setShowControls(true)}
            className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-black/50 text-white/70 text-xs hover:bg-black/70 hover:text-white transition-colors"
          >
            Esc: メニュー表示
          </button>
        )}
      </div>

      {/* Controls */}
      {showControls && (
        <div className="px-4 py-3 bg-[#16213e] border-t border-[#0f3460] space-y-2">
          {/* Status bar */}
          <div className="flex justify-between text-xs text-gray-400">
            <span>{status}</span>
            <span>
              {vrmName && `${vrmName} | `}
              {fps} FPS
            </span>
          </div>

          {/* Main controls */}
          <div className="flex flex-wrap gap-2">
            <label className="btn">
              VRMファイル
              <input
                type="file"
                accept=".vrm"
                onChange={handleVRMUpload}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className={`btn ${showPreview ? "btn-active" : ""}`}
            >
              プレビュー
            </button>

            <button
              type="button"
              onClick={() => setMirror((v) => !v)}
              className={`btn ${mirror ? "btn-active" : ""}`}
            >
              反転
            </button>

            <button
              type="button"
              onClick={() => { if (!tracking) setHandTracking((v) => !v); }}
              className={`btn ${handTracking ? "btn-active" : ""} ${tracking ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              指トラッキング
            </button>

            <button
              type="button"
              onClick={() => setTracking((v) => !v)}
              className={`btn ${tracking ? "bg-red-600! hover:bg-red-700!" : "bg-emerald-600! hover:bg-emerald-700!"}`}
            >
              {tracking ? "停止" : "開始"}
            </button>

            <button
              type="button"
              onClick={() => setShowControls(false)}
              className="btn ml-auto"
              title="Escキーでも切替可能"
            >
              メニュー非表示
            </button>
          </div>

          {/* Background color */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">背景:</span>
            {BG_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setBgColor(preset.value)}
                className={`w-7 h-7 rounded border-2 text-[10px] flex items-center justify-center transition-colors ${
                  bgColor === preset.value
                    ? "border-white"
                    : "border-white/20 hover:border-white/50"
                }`}
                style={{
                  backgroundColor: preset.value ?? "transparent",
                  backgroundImage: preset.value
                    ? undefined
                    : "linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)",
                  backgroundSize: preset.value ? undefined : "8px 8px",
                  backgroundPosition: preset.value
                    ? undefined
                    : "0 0, 4px 4px",
                }}
                title={preset.label}
              >
                {!preset.value && "✕"}
              </button>
            ))}
            <input
              type="color"
              value={bgColor ?? "#000000"}
              onChange={(e) => setBgColor(e.target.value)}
              className="w-7 h-7 rounded border-2 border-white/20 cursor-pointer bg-transparent"
              title="カスタム色"
            />
          </div>
        </div>
      )}
    </div>
  );
}

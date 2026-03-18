import { useEffect, useRef, useCallback, useState } from "react";
import {
  createVRMScene,
  loadVRM,
  renderFrame,
  resizeRenderer,
  type VRMScene,
} from "../lib/vrm-scene";
import {
  createFaceTracker,
  setupWebcam,
  type FaceTracker,
} from "../lib/face-tracker";
import { applyTracking } from "../lib/vrm-animator";

const DEFAULT_VRM_URL = "/models/default.vrm";

export function VRMViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const vrmSceneRef = useRef<VRMScene | null>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const animationIdRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState("初期化中...");
  const [tracking, setTracking] = useState(false);
  const [fps, setFps] = useState(0);

  // Initialize Three.js scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const vrmScene = createVRMScene(canvas);
    vrmSceneRef.current = vrmScene;

    // Load default VRM if available
    loadVRM(vrmScene, DEFAULT_VRM_URL)
      .then(() => setStatus("VRMロード完了"))
      .catch(() => setStatus("VRMファイルを選択してください"));

    // Resize handler
    const onResize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        resizeRenderer(vrmScene, rect.width, rect.height);
      }
    };
    window.addEventListener("resize", onResize);

    // Render loop (always runs)
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
      const tracker = await createFaceTracker();
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
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
    };
  }, [tracking]);

  const handleVRMUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !vrmSceneRef.current) return;

      setStatus("VRMロード中...");
      const url = URL.createObjectURL(file);
      try {
        await loadVRM(vrmSceneRef.current, url);
        setStatus("VRMロード完了");
      } catch (err) {
        setStatus(`VRMロード失敗: ${err}`);
      }
    },
    [],
  );

  const toggleTracking = useCallback(() => {
    setTracking((prev) => !prev);
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.viewer}>
        <canvas ref={canvasRef} style={styles.canvas} />
        <video
          ref={videoRef}
          style={styles.video}
          playsInline
          muted
        />
      </div>
      <div style={styles.controls}>
        <div style={styles.statusBar}>
          <span>{status}</span>
          <span>{fps} FPS</span>
        </div>
        <div style={styles.buttons}>
          <label style={styles.button}>
            VRMファイルを選択
            <input
              type="file"
              accept=".vrm"
              onChange={handleVRMUpload}
              style={styles.fileInput}
            />
          </label>
          <button
            type="button"
            onClick={toggleTracking}
            style={{
              ...styles.button,
              background: tracking ? "#e74c3c" : "#2ecc71",
            }}
          >
            {tracking ? "トラッキング停止" : "トラッキング開始"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background: "#1a1a2e",
    color: "#eee",
    fontFamily: "system-ui, sans-serif",
  },
  viewer: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  canvas: {
    width: "100%",
    height: "100%",
    display: "block",
  },
  video: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 200,
    height: 150,
    borderRadius: 8,
    objectFit: "cover",
    border: "2px solid rgba(255,255,255,0.2)",
    transform: "scaleX(-1)",
  },
  controls: {
    padding: "12px 16px",
    background: "#16213e",
    borderTop: "1px solid #0f3460",
  },
  statusBar: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 8,
    fontSize: 14,
    opacity: 0.8,
  },
  buttons: {
    display: "flex",
    gap: 12,
  },
  button: {
    padding: "8px 16px",
    border: "none",
    borderRadius: 6,
    background: "#0f3460",
    color: "#eee",
    cursor: "pointer",
    fontSize: 14,
  },
  fileInput: {
    display: "none",
  },
};

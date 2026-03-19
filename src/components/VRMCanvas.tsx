import { useMemo, Suspense, useRef, useEffect, useCallback, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { VRMModel } from "./VRMModel";
import { LightHelper } from "./LightHelper";
import type { VRM } from "@pixiv/three-vrm";
import type { FaceTracker } from "@/lib/face-tracker";
import type { LightingSettings } from "@/lib/vrm-scene";
import type { EffectSettings } from "@/lib/effects";
import { DEFAULT_CAMERA, type CameraState } from "@/lib/camera";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

interface VRMCanvasProps {
  vrmUrl: string | null;
  tracker: FaceTracker | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mirror: boolean;
  lighting: LightingSettings;
  showLightHelper: boolean;
  bgColor: string | null;
  bgImage: string | null;
  effects: EffectSettings;
  cameraState: CameraState | null;
  onCameraChange?: (state: CameraState) => void;
  expressionOverrides: Record<string, number>;
  onVRMLoaded?: (vrm: VRM) => void;
  onVRMLoadingChange?: (loading: boolean) => void;
  onResetCamera?: React.MutableRefObject<(() => void) | null>;
}

const textureLoader = new THREE.TextureLoader();

function BackgroundImage({ url }: { url: string }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    textureLoader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      setTexture(tex);
    });
  }, [url]);
  if (!texture) return null;
  return <primitive object={texture} attach="background" />;
}

export function VRMCanvas({
  vrmUrl,
  tracker,
  videoRef,
  mirror,
  lighting,
  showLightHelper: showHelper,
  bgColor,
  bgImage,
  effects,
  cameraState,
  onCameraChange,
  expressionOverrides,
  onVRMLoaded,
  onVRMLoadingChange,
  onResetCamera,
}: VRMCanvasProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const initializedRef = useRef(false);

  // Restore camera state on mount
  useEffect(() => {
    if (initializedRef.current || !cameraState) return;
    const tryRestore = () => {
      const controls = controlsRef.current;
      if (!controls) {
        requestAnimationFrame(tryRestore);
        return;
      }
      controls.object.position.set(...cameraState.position);
      controls.target.set(...cameraState.target);
      controls.update();
      initializedRef.current = true;
    };
    requestAnimationFrame(tryRestore);
  }, [cameraState]);

  const handleCameraChange = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls || !onCameraChange) return;
    const p = controls.object.position;
    const t = controls.target;
    onCameraChange({
      position: [p.x, p.y, p.z],
      target: [t.x, t.y, t.z],
    });
  }, [onCameraChange]);

  useEffect(() => {
    if (!onResetCamera) return;
    const ref = onResetCamera;
    ref.current = () => {
      const controls = controlsRef.current;
      if (controls) {
        controls.object.position.set(...DEFAULT_CAMERA.position);
        controls.target.set(...DEFAULT_CAMERA.target);
        controls.update();
        onCameraChange?.(DEFAULT_CAMERA);
      }
    };
  }, [onResetCamera, onCameraChange]);

  const lightPosition = useMemo((): [number, number, number] => {
    const hRad = (lighting.dirAngleH * Math.PI) / 180;
    const vRad = (lighting.dirAngleV * Math.PI) / 180;
    const dist = lighting.dirDistance;
    return [
      Math.cos(vRad) * Math.sin(hRad) * dist,
      Math.sin(vRad) * dist + 1.2,
      Math.cos(vRad) * Math.cos(hRad) * dist,
    ];
  }, [lighting.dirAngleH, lighting.dirAngleV, lighting.dirDistance]);

  return (
    <div className="h-full w-full" style={{ transform: mirror ? "scaleX(-1)" : undefined }}>
      <Canvas
        camera={{ position: [0, 1.4, 1.5], fov: 30, near: 0.1, far: 20 }}
        gl={{ alpha: true, antialias: true }}
        shadows={effects.contactShadows}
      >
        {bgImage ? (
          <Suspense fallback={bgColor ? <color attach="background" args={[bgColor]} /> : null}>
            <BackgroundImage url={bgImage} />
          </Suspense>
        ) : bgColor ? (
          <color attach="background" args={[bgColor]} />
        ) : null}

        {effects.fog && (
          <fog attach="fog" args={[effects.fogColor, effects.fogNear, effects.fogFar]} />
        )}

        <ambientLight intensity={lighting.ambIntensity} />
        <directionalLight
          position={lightPosition}
          intensity={lighting.dirIntensity}
          castShadow={effects.contactShadows}
        />

        <OrbitControls
          ref={controlsRef}
          target={[0, 1.2, 0]}
          enablePan
          screenSpacePanning
          onChange={handleCameraChange}
        />

        {showHelper && <LightHelper position={lightPosition} />}

        {effects.contactShadows && (
          <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={3} blur={2} far={2} />
        )}

        {vrmUrl && (
          <VRMModel
            url={vrmUrl}
            tracker={tracker}
            videoRef={videoRef}
            expressionOverrides={expressionOverrides}
            onLoaded={onVRMLoaded}
            onLoadingChange={onVRMLoadingChange}
          />
        )}

        {effects.bloom && effects.vignette && (
          <EffectComposer>
            <Bloom
              intensity={effects.bloomIntensity}
              luminanceThreshold={effects.bloomThreshold}
              luminanceSmoothing={0.3}
            />
            <Vignette darkness={effects.vignetteIntensity} offset={0.3} />
          </EffectComposer>
        )}
        {effects.bloom && !effects.vignette && (
          <EffectComposer>
            <Bloom
              intensity={effects.bloomIntensity}
              luminanceThreshold={effects.bloomThreshold}
              luminanceSmoothing={0.3}
            />
          </EffectComposer>
        )}
        {!effects.bloom && effects.vignette && (
          <EffectComposer>
            <Vignette darkness={effects.vignetteIntensity} offset={0.3} />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { VRM } from "@pixiv/three-vrm";
import {
  VRMLoaderPlugin,
  VRMUtils,
  VRMSpringBoneColliderShapeCapsule,
  VRMSpringBoneColliderShapeSphere,
} from "@pixiv/three-vrm";
import * as THREE from "three";
import { applyTracking } from "@/lib/vrm-animator";
import type { FaceTracker } from "@/lib/face-tracker";

interface VRMModelProps {
  url: string | null;
  tracker: FaceTracker | null;
  expressionOverrides: Record<string, number>;
  onLoaded?: (vrm: VRM) => void;
  onLoadingChange?: (loading: boolean) => void;
}

export function VRMModel({
  url,
  tracker,
  expressionOverrides,
  onLoaded,
  onLoadingChange,
}: VRMModelProps) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Find video element for tracking (set externally)
  useEffect(() => {
    videoRef.current = document.querySelector<HTMLVideoElement>(
      "video[data-vrm-tracking]",
    );
  }, []);

  // Load VRM
  useEffect(() => {
    if (!url) return;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    onLoadingChange?.(true);
    loader.load(url, (gltf) => {
      const newVrm = gltf.userData.vrm as VRM;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);

      newVrm.scene.traverse((obj) => {
        obj.frustumCulled = false;
      });

      // Relax spring bone colliders
      const manager = newVrm.springBoneManager;
      if (manager) {
        for (const collider of manager.colliders) {
          const shape = collider.shape;
          if (shape instanceof VRMSpringBoneColliderShapeCapsule) {
            shape.radius *= 1;
          } else if (shape instanceof VRMSpringBoneColliderShapeSphere) {
            shape.radius *= 1;
          }
        }
        for (const joint of manager.joints) {
          joint.settings.stiffness *= 1;
        }
      }

      setVrm((prev) => {
        if (prev && groupRef.current) {
          groupRef.current.remove(prev.scene);
        }
        return newVrm;
      });

      onLoadingChange?.(false);
      onLoaded?.(newVrm);
    });
  }, [url, onLoaded, onLoadingChange]);

  // Add VRM scene to group
  useEffect(() => {
    const group = groupRef.current;
    if (vrm && group) {
      group.add(vrm.scene);
    }
    return () => {
      if (vrm && group) {
        group.remove(vrm.scene);
      }
    };
  }, [vrm]);

  // Animation loop
  useFrame((_, delta) => {
    if (!vrm) return;

    // Apply tracking
    const video = videoRef.current;
    if (tracker && video && video.readyState >= 2) {
      const result = tracker.detect(video);
      applyTracking(vrm, result);
    }

    // Apply expression overrides
    const em = vrm.expressionManager;
    if (em) {
      for (const [name, value] of Object.entries(expressionOverrides)) {
        if (value > 0) em.setValue(name, value);
      }
    }

    vrm.update(delta);
  });

  return <group ref={groupRef} rotation-y={Math.PI} />;
}

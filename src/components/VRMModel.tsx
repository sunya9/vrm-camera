import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { VRM } from "@pixiv/three-vrm";
import {
  VRMLoaderPlugin,
  VRMUtils,
  VRMSpringBoneColliderShapeCapsule,
  VRMSpringBoneColliderShapeSphere,
  VRMSpringBoneColliderHelper,
  VRMSpringBoneJointHelper,
} from "@pixiv/three-vrm";
import * as THREE from "three";
import { applyTracking } from "@/lib/vrm-animator";
import type { FaceTracker, TrackingResult } from "@/lib/face-tracker";

function isDescendantOf(obj: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let current = obj.parent;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

export interface GestureEvent {
  hand: string; // "Left" | "Right"
  gesture: string; // e.g. "Victory", "Open_Palm", etc.
  score: number;
}

interface VRMModelProps {
  url: string | null;
  tracker: FaceTracker | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  expressionOverrides: Record<string, number>;
  onLoaded?: (vrm: VRM) => void;
  onLoadingChange?: (loading: boolean) => void;
  onGestureChange?: (gestures: GestureEvent[]) => void;
  showColliderHelper?: boolean;
  headColliderScale?: number;
  hairStiffnessScale?: number;
  onTrackingResult?: (result: TrackingResult) => void;
  showBoneHelper?: boolean;
}

export function VRMModel({
  url,
  tracker,
  videoRef,
  expressionOverrides,
  onLoaded,
  onLoadingChange,
  onGestureChange,
  showColliderHelper = false,
  headColliderScale = 1.5,
  hairStiffnessScale = 1.0,
  onTrackingResult,
  showBoneHelper = false,
}: VRMModelProps) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const prevGesturesRef = useRef<string>("");
  const helpersRef = useRef<THREE.Object3D[]>([]);
  const skeletonHelperRef = useRef<THREE.SkeletonHelper | null>(null);
  const originalStiffnessRef = useRef<Map<object, number>>(new Map());

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

      // Scale up head-attached colliders to prevent hair clipping
      const manager = newVrm.springBoneManager;
      if (manager) {
        const headBone = newVrm.humanoid.getNormalizedBoneNode("head");
        for (const collider of manager.colliders) {
          const isHeadCollider = headBone && isDescendantOf(collider, headBone);
          if (!isHeadCollider) continue;

          const shape = collider.shape;
          if (shape instanceof VRMSpringBoneColliderShapeCapsule) {
            shape.radius *= headColliderScale;
          } else if (shape instanceof VRMSpringBoneColliderShapeSphere) {
            shape.radius *= headColliderScale;
          }
        }

        // Store original stiffness values for dynamic scaling
        const stiffnessMap = new Map<object, number>();
        for (const joint of manager.joints) {
          stiffnessMap.set(joint, joint.settings.stiffness);
        }
        originalStiffnessRef.current = stiffnessMap;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Reload only when url or headColliderScale changes, not on callback identity changes
  }, [url, headColliderScale]);

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

  // Apply hair stiffness scale dynamically (VRM joint settings are mutable by design)
  useEffect(() => {
    const manager = vrm?.springBoneManager;
    if (!manager) return;
    for (const joint of manager.joints) {
      const original = originalStiffnessRef.current.get(joint);
      if (original != null) {
        joint.settings.stiffness = original * hairStiffnessScale;
      }
    }
  }, [vrm, hairStiffnessScale]);

  // Spring bone helpers (collider & joint visualization)
  useEffect(() => {
    const group = groupRef.current;
    if (!vrm || !group) return;

    // Clean up previous helpers
    for (const h of helpersRef.current) {
      group.remove(h);
      if ("dispose" in h && typeof h.dispose === "function") {
        (h as { dispose: () => void }).dispose();
      }
    }
    helpersRef.current = [];

    if (!showColliderHelper) return;

    const manager = vrm.springBoneManager;
    if (!manager) return;

    for (const collider of manager.colliders) {
      const helper = new VRMSpringBoneColliderHelper(collider);
      group.add(helper);
      helpersRef.current.push(helper);
    }

    for (const joint of manager.joints) {
      const helper = new VRMSpringBoneJointHelper(joint);
      group.add(helper);
      helpersRef.current.push(helper);
    }

    return () => {
      for (const h of helpersRef.current) {
        group.remove(h);
        if ("dispose" in h && typeof h.dispose === "function") {
          (h as { dispose: () => void }).dispose();
        }
      }
      helpersRef.current = [];
    };
  }, [vrm, showColliderHelper]);

  // Skeleton helper (bone visualization)
  // Added to scene root (not the rotated group) because SkeletonHelper
  // reads bone.matrixWorld (already includes group rotation). Placing it
  // inside the rotated group would cause double rotation.
  const { scene } = useThree();
  useEffect(() => {
    if (!vrm) return;

    if (skeletonHelperRef.current) {
      scene.remove(skeletonHelperRef.current);
      skeletonHelperRef.current.dispose();
      skeletonHelperRef.current = null;
    }

    if (!showBoneHelper) return;

    const helper = new THREE.SkeletonHelper(vrm.scene);
    helper.visible = true;
    scene.add(helper);
    skeletonHelperRef.current = helper;

    return () => {
      if (skeletonHelperRef.current) {
        scene.remove(skeletonHelperRef.current);
        skeletonHelperRef.current.dispose();
        skeletonHelperRef.current = null;
      }
    };
  }, [vrm, showBoneHelper, scene]);

  // Animation loop
  useFrame((_, delta) => {
    if (!vrm) return;

    // Apply tracking
    const video = videoRef.current;
    if (tracker && video && video.readyState >= 2) {
      const result = tracker.detect(video);
      applyTracking(vrm, result);
      onTrackingResult?.(result);

      // Detect gesture changes
      if (onGestureChange && result.hands?.gestures?.length) {
        const currentGestures: GestureEvent[] = [];
        for (let i = 0; i < result.hands.gestures.length; i++) {
          const top = result.hands.gestures[i]?.[0];
          if (top && top.categoryName !== "None") {
            currentGestures.push({
              hand: result.hands.handedness[i]?.[0]?.categoryName ?? "Unknown",
              gesture: top.categoryName,
              score: top.score,
            });
          }
        }
        const key = currentGestures.map((g) => `${g.hand}:${g.gesture}`).join(",");
        if (key !== prevGesturesRef.current) {
          prevGesturesRef.current = key;
          if (currentGestures.length > 0) {
            onGestureChange(currentGestures);
          }
        }
      } else if (prevGesturesRef.current !== "") {
        prevGesturesRef.current = "";
      }
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

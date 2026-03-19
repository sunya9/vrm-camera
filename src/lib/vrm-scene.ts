import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { VRM } from "@pixiv/three-vrm";
import {
  VRMLoaderPlugin,
  VRMUtils,
  VRMSpringBoneColliderShapeCapsule,
  VRMSpringBoneColliderShapeSphere,
} from "@pixiv/three-vrm";

export interface VRMScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  clock: THREE.Clock;
  vrm: VRM | null;
  directionalLight: THREE.DirectionalLight;
  lightHelper: THREE.Mesh;
  lightLine: THREE.Line;
  ambientLight: THREE.AmbientLight;
  dispose: () => void;
}

export function createVRMScene(canvas: HTMLCanvasElement): VRMScene {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  const camera = new THREE.PerspectiveCamera(
    30,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    20,
  );
  camera.position.set(0, 1.4, 1.5);

  const controls = new OrbitControls(camera, canvas);
  controls.screenSpacePanning = true;
  controls.target.set(0, 1.2, 0);
  controls.update();

  const scene = new THREE.Scene();

  const directional = new THREE.DirectionalLight(0xffffff, Math.PI);
  directional.position.set(1, 1, 1).normalize();
  scene.add(directional);

  const helperGeo = new THREE.SphereGeometry(0.15, 16, 16);
  const helperMat = new THREE.MeshBasicMaterial({
    color: 0xffdd44,
    transparent: true,
    opacity: 0.8,
    depthTest: false,
  });
  const lightSphere = new THREE.Mesh(helperGeo, helperMat);
  lightSphere.renderOrder = 999;
  lightSphere.visible = false;
  scene.add(lightSphere);

  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0),
  ]);
  const lineMat = new THREE.LineDashedMaterial({
    color: 0xffdd44,
    dashSize: 0.1,
    gapSize: 0.05,
    transparent: true,
    opacity: 0.5,
    depthTest: false,
  });
  const lightLine = new THREE.Line(lineGeo, lineMat);
  lightLine.renderOrder = 998;
  lightLine.visible = false;
  scene.add(lightLine);

  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  const clock = new THREE.Clock();

  const state: VRMScene = {
    renderer,
    scene,
    camera,
    controls,
    clock,
    vrm: null,
    directionalLight: directional,
    lightHelper: lightSphere,
    lightLine,
    ambientLight: ambient,
    dispose: () => {
      controls.dispose();
      renderer.dispose();
    },
  };

  return state;
}

export async function loadVRM(vrmScene: VRMScene, url: string): Promise<VRM> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM;

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);

        vrm.scene.traverse((obj) => {
          obj.frustumCulled = false;
        });

        // Remove previous VRM if exists
        if (vrmScene.vrm) {
          vrmScene.scene.remove(vrmScene.vrm.scene);
        }

        // VRM 1.0 models face +Z, rotate to face camera (-Z)
        vrm.scene.rotation.y = Math.PI;

        // Relax spring bone colliders to reduce hair clipping
        relaxSpringBoneColliders(vrm);

        vrmScene.scene.add(vrm.scene);
        vrmScene.vrm = vrm;

        resolve(vrm);
      },
      undefined,
      reject,
    );
  });
}

export function renderFrame(vrmScene: VRMScene): void {
  const delta = vrmScene.clock.getDelta();
  if (vrmScene.vrm) {
    vrmScene.vrm.update(delta);
  }
  vrmScene.renderer.render(vrmScene.scene, vrmScene.camera);
}

export function resizeRenderer(
  vrmScene: VRMScene,
  width: number,
  height: number,
): void {
  vrmScene.camera.aspect = width / height;
  vrmScene.camera.updateProjectionMatrix();
  vrmScene.renderer.setSize(width, height);
}

function relaxSpringBoneColliders(vrm: VRM): void {
  const manager = vrm.springBoneManager;
  if (!manager) return;

  // Shrink all collider radii to reduce hair clipping
  const COLLIDER_SCALE = 1;
  for (const collider of manager.colliders) {
    const shape = collider.shape;
    if (shape instanceof VRMSpringBoneColliderShapeCapsule) {
      shape.radius *= COLLIDER_SCALE;
    } else if (shape instanceof VRMSpringBoneColliderShapeSphere) {
      shape.radius *= COLLIDER_SCALE;
    }
  }

  // Reduce stiffness for more natural draping
  for (const joint of manager.joints) {
    joint.settings.stiffness *= 1;
  }
}

export function resetCamera(vrmScene: VRMScene): void {
  vrmScene.camera.position.set(0, 1.4, 1.5);
  vrmScene.controls.target.set(0, 1.2, 0);
  vrmScene.controls.update();
}

export function resetPose(vrmScene: VRMScene): void {
  const vrm = vrmScene.vrm;
  if (!vrm) return;
  vrm.humanoid.resetNormalizedPose();
  if (vrm.expressionManager) {
    vrm.expressionManager.setValue("happy", 0);
    vrm.expressionManager.setValue("angry", 0);
    vrm.expressionManager.setValue("sad", 0);
    vrm.expressionManager.setValue("relaxed", 0);
    vrm.expressionManager.setValue("surprised", 0);
    vrm.expressionManager.setValue("aa", 0);
    vrm.expressionManager.setValue("blink", 0);
    vrm.expressionManager.setValue("blinkLeft", 0);
    vrm.expressionManager.setValue("blinkRight", 0);
  }
}

export interface LightingSettings {
  dirIntensity: number;  // 0-5
  dirAngleH: number;     // -180 to 180 (horizontal angle in degrees)
  dirAngleV: number;     // -90 to 90 (vertical angle in degrees)
  dirDistance: number;    // 0.5-5
  ambIntensity: number;  // 0-2
}

export const DEFAULT_LIGHTING: LightingSettings = {
  dirIntensity: Math.PI,
  dirAngleH: 45,
  dirAngleV: 45,
  dirDistance: 2,
  ambIntensity: 0.4,
};

export function setLighting(vrmScene: VRMScene, settings: LightingSettings): void {
  const { directionalLight, ambientLight, lightHelper } = vrmScene;

  directionalLight.intensity = settings.dirIntensity;
  ambientLight.intensity = settings.ambIntensity;

  // Convert angles to position on unit sphere
  const hRad = (settings.dirAngleH * Math.PI) / 180;
  const vRad = (settings.dirAngleV * Math.PI) / 180;
  const dist = 2;
  const x = Math.cos(vRad) * Math.sin(hRad) * dist;
  const y = Math.sin(vRad) * dist + 1.2;
  const z = Math.cos(vRad) * Math.cos(hRad) * dist;

  directionalLight.position.set(x, y, z);
  directionalLight.target.position.set(0, 1.2, 0);
  directionalLight.target.updateMatrixWorld();

  // Sync helper sphere and line
  lightHelper.position.set(x, y, z);

  const linePositions = vrmScene.lightLine.geometry.attributes.position;
  if (linePositions) {
    linePositions.setXYZ(0, x, y, z);
    linePositions.setXYZ(1, 0, 1.2, 0);
    linePositions.needsUpdate = true;
    vrmScene.lightLine.computeLineDistances();
  }
}

export function showLightHelper(vrmScene: VRMScene, visible: boolean): void {
  vrmScene.lightHelper.visible = visible;
  vrmScene.lightLine.visible = visible;
}

export function setBackgroundColor(
  vrmScene: VRMScene,
  color: string | null,
): void {
  if (color) {
    vrmScene.scene.background = new THREE.Color(color);
  } else {
    vrmScene.scene.background = null;
  }
}

const textureLoader = new THREE.TextureLoader();

export function setBackgroundImage(
  vrmScene: VRMScene,
  url: string | null,
): void {
  if (url) {
    textureLoader.load(url, (texture) => {
      vrmScene.scene.background = texture;
    });
  } else {
    vrmScene.scene.background = null;
  }
}

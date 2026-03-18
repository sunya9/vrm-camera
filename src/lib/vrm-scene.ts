import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { VRM } from "@pixiv/three-vrm";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

export interface VRMScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  clock: THREE.Clock;
  vrm: VRM | null;
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
    dispose: () => {
      controls.dispose();
      renderer.dispose();
    },
  };

  return state;
}

export async function loadVRM(
  vrmScene: VRMScene,
  url: string,
): Promise<VRM> {
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

export function resizeRenderer(vrmScene: VRMScene, width: number, height: number): void {
  vrmScene.camera.aspect = width / height;
  vrmScene.camera.updateProjectionMatrix();
  vrmScene.renderer.setSize(width, height);
}

export function setBackground(vrmScene: VRMScene, color: string | null): void {
  if (color) {
    vrmScene.scene.background = new THREE.Color(color);
  } else {
    vrmScene.scene.background = null;
  }
}

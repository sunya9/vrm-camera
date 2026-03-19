export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
}

export const DEFAULT_CAMERA: CameraState = {
  position: [0, 1.4, 1.5],
  target: [0, 1.2, 0],
};

export interface LightingSettings {
  dirIntensity: number; // 0-5
  dirAngleH: number; // -180 to 180 (horizontal angle in degrees)
  dirAngleV: number; // -90 to 90 (vertical angle in degrees)
  dirDistance: number; // 0.5-5
  ambIntensity: number; // 0-2
}

export const DEFAULT_LIGHTING: LightingSettings = {
  dirIntensity: Math.PI,
  dirAngleH: 45,
  dirAngleV: 45,
  dirDistance: 2,
  ambIntensity: 0.4,
};

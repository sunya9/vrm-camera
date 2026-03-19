export interface EffectSettings {
  bloom: boolean;
  bloomIntensity: number; // 0-3
  bloomThreshold: number; // 0-1
  vignette: boolean;
  vignetteIntensity: number; // 0-1
  fog: boolean;
  fogColor: string;
  fogNear: number; // 0-10
  fogFar: number; // 0-20
  contactShadows: boolean;
}

export const DEFAULT_EFFECTS: EffectSettings = {
  bloom: false,
  bloomIntensity: 0.5,
  bloomThreshold: 0.8,
  vignette: false,
  vignetteIntensity: 0.4,
  fog: false,
  fogColor: "#1a1a2e",
  fogNear: 3,
  fogFar: 10,
  contactShadows: false,
};

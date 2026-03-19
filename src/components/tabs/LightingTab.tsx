import type { LightingSettings } from "@/lib/vrm-scene";
import { DEFAULT_LIGHTING } from "@/lib/vrm-scene";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

interface LightingTabProps {
  lighting: LightingSettings;
  showLightHelper: boolean;
  onSetLighting: (settings: LightingSettings) => void;
  onSetShowLightHelper: (v: boolean) => void;
}

const SLIDERS = [
  { label: "光の強さ", key: "dirIntensity" as const, min: 0, max: 5, step: 0.1 },
  { label: "水平角度", key: "dirAngleH" as const, min: -180, max: 180, step: 5 },
  { label: "垂直角度", key: "dirAngleV" as const, min: -90, max: 90, step: 5 },
  { label: "距離", key: "dirDistance" as const, min: 0.5, max: 5, step: 0.1 },
  { label: "環境光", key: "ambIntensity" as const, min: 0, max: 2, step: 0.05 },
] as const;

export function LightingTab({
  lighting,
  showLightHelper,
  onSetLighting,
  onSetShowLightHelper,
}: LightingTabProps) {
  return (
    <div className="space-y-2">
      <div className="max-w-xs space-y-2">
        {SLIDERS.map((s) => (
          <div key={s.key} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">{s.label}</span>
            <Slider
              min={s.min}
              max={s.max}
              step={s.step}
              value={[lighting[s.key]]}
              onValueChange={(v) =>
                onSetLighting({ ...lighting, [s.key]: Array.isArray(v) ? v[0] : v })
              }
              className="flex-1"
            />
            <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
              {lighting[s.key].toFixed(s.step < 1 ? 1 : 0)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSetLighting(DEFAULT_LIGHTING)}
          className="text-xs text-muted-foreground"
        >
          デフォルトに戻す
        </Button>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <Switch checked={showLightHelper} onCheckedChange={onSetShowLightHelper} />
          光源表示
        </label>
      </div>
    </div>
  );
}

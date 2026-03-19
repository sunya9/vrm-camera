import type { EffectSettings } from "@/lib/effects";
import { DEFAULT_EFFECTS } from "@/lib/effects";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

interface EffectsTabProps {
  effects: EffectSettings;
  onSetEffects: (settings: EffectSettings) => void;
}

export function EffectsTab({ effects, onSetEffects }: EffectsTabProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {(
          [
            { key: "bloom", label: "Bloom" },
            { key: "vignette", label: "Vignette" },
            { key: "fog", label: "Fog" },
            { key: "contactShadows", label: "接地影" },
          ] as const
        ).map((item) => (
          <label
            key={item.key}
            className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Switch
              checked={effects[item.key]}
              onCheckedChange={(v) => onSetEffects({ ...effects, [item.key]: v })}
            />
            {item.label}
          </label>
        ))}
      </div>
      <div className="max-w-xs space-y-2">
        {effects.bloom &&
          (
            [
              { label: "強さ", key: "bloomIntensity" as const, min: 0, max: 3, step: 0.1 },
              { label: "閾値", key: "bloomThreshold" as const, min: 0, max: 1, step: 0.05 },
            ] as const
          ).map((s) => (
            <SliderRow
              key={s.key}
              label={s.label}
              min={s.min}
              max={s.max}
              step={s.step}
              value={effects[s.key]}
              onChange={(v) => onSetEffects({ ...effects, [s.key]: v })}
            />
          ))}
        {effects.vignette && (
          <SliderRow
            label="暗さ"
            min={0}
            max={1}
            step={0.05}
            value={effects.vignetteIntensity}
            onChange={(v) => onSetEffects({ ...effects, vignetteIntensity: v })}
          />
        )}
        {effects.fog &&
          (
            [
              { label: "近距離", key: "fogNear" as const, min: 0, max: 10, step: 0.5 },
              { label: "遠距離", key: "fogFar" as const, min: 1, max: 20, step: 0.5 },
            ] as const
          ).map((s) => (
            <SliderRow
              key={s.key}
              label={s.label}
              min={s.min}
              max={s.max}
              step={s.step}
              value={effects[s.key]}
              onChange={(v) => onSetEffects({ ...effects, [s.key]: v })}
            />
          ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSetEffects(DEFAULT_EFFECTS)}
        className="text-xs text-muted-foreground"
      >
        デフォルトに戻す
      </Button>
    </div>
  );
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-xs text-muted-foreground">{label}</span>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
        className="flex-1"
      />
      <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">
        {value.toFixed(step < 1 ? 1 : 0)}
      </span>
    </div>
  );
}

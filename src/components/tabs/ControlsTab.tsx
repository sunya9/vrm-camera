import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Upload, Play, Square } from "lucide-react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ControlsTabProps {
  tracking: boolean;
  handTracking: boolean;
  mirror: boolean;
  showColliderHelper: boolean;
  headColliderScale: number;
  onVRMUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleTracking: () => void;
  onSetMirror: (v: boolean) => void;
  onSetHandTracking: (v: boolean) => void;
  onSetShowColliderHelper: (v: boolean) => void;
  showBoneHelper: boolean;
  onSetShowBoneHelper: (v: boolean) => void;
  onSetHeadColliderScale: (v: number) => void;
  hairStiffnessScale: number;
  onSetHairStiffnessScale: (v: number) => void;
}

export function ControlsTab({
  tracking,
  handTracking,
  mirror,
  showColliderHelper,
  headColliderScale,
  onVRMUpload,
  onToggleTracking,
  onSetMirror,
  onSetHandTracking,
  onSetShowColliderHelper,
  showBoneHelper,
  onSetShowBoneHelper,
  onSetHeadColliderScale,
  hairStiffnessScale,
  onSetHairStiffnessScale,
}: ControlsTabProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" className="relative cursor-pointer">
        <Upload /> VRMファイルを開く
        <input
          type="file"
          accept=".vrm"
          onChange={onVRMUpload}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </Button>

      <Field orientation="horizontal" className="w-fit">
        <Switch checked={mirror} onCheckedChange={onSetMirror} />
        <FieldLabel>反転</FieldLabel>
      </Field>

      <Field orientation="horizontal" className="w-fit">
        <Switch
          checked={handTracking}
          onCheckedChange={(v) => {
            if (!tracking) onSetHandTracking(v);
          }}
          disabled={tracking}
        />
        <Tooltip>
          <TooltipTrigger disabled={!tracking} render={<FieldLabel>指</FieldLabel>} />
          <TooltipContent>指のトラッキングの変更は停止中のみ可能です。</TooltipContent>
        </Tooltip>
      </Field>

      <Button
        size="sm"
        variant={tracking ? "outline" : "default"}
        onClick={onToggleTracking}
        className="min-w-20"
      >
        {tracking ? (
          <>
            <Square /> トラッキング停止
          </>
        ) : (
          <>
            <Play /> トラッキング開始
          </>
        )}
      </Button>

      <div className="h-4 w-px bg-border" />

      <Field orientation="horizontal" className="w-fit">
        <Switch checked={showColliderHelper} onCheckedChange={onSetShowColliderHelper} />
        <FieldLabel>コライダー</FieldLabel>
      </Field>

      <Field orientation="horizontal" className="w-fit">
        <Switch checked={showBoneHelper} onCheckedChange={onSetShowBoneHelper} />
        <FieldLabel>ボーン</FieldLabel>
      </Field>

      <Field orientation="horizontal" className="w-fit gap-2">
        <FieldLabel className="text-xs text-muted-foreground">
          頭 ×{headColliderScale.toFixed(1)}
        </FieldLabel>
        <input
          type="range"
          min="1.0"
          max="3.0"
          step="0.1"
          value={headColliderScale}
          onChange={(e) => onSetHeadColliderScale(Number(e.target.value))}
          className="h-1 w-20 accent-primary"
        />
      </Field>
      <Field orientation="horizontal" className="w-fit gap-2">
        <FieldLabel className="text-xs text-muted-foreground">
          硬さ ×{hairStiffnessScale.toFixed(1)}
        </FieldLabel>
        <input
          type="range"
          min="0.5"
          max="5.0"
          step="0.1"
          value={hairStiffnessScale}
          onChange={(e) => onSetHairStiffnessScale(Number(e.target.value))}
          className="h-1 w-20 accent-primary"
        />
      </Field>
    </div>
  );
}

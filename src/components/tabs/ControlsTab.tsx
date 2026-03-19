import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Upload, Play, Square } from "lucide-react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ControlsTabProps {
  tracking: boolean;
  handTracking: boolean;
  mirror: boolean;
  onVRMUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleTracking: () => void;
  onSetMirror: (v: boolean) => void;
  onSetHandTracking: (v: boolean) => void;
}

export function ControlsTab({
  tracking,
  handTracking,
  mirror,
  onVRMUpload,
  onToggleTracking,
  onSetMirror,
  onSetHandTracking,
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
    </div>
  );
}

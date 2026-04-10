import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Upload, Play, Square } from "lucide-react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CameraDevice } from "@/lib/face-tracker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  cameraDevices: CameraDevice[];
  selectedCamera: string | null;
  onSetSelectedCamera: (deviceId: string | null) => void;
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
  cameraDevices,
  selectedCamera,
  onSetSelectedCamera,
  onSetShowColliderHelper,
  showBoneHelper,
  onSetShowBoneHelper,
  onSetHeadColliderScale,
  hairStiffnessScale,
  onSetHairStiffnessScale,
}: ControlsTabProps) {
  const cameraItems = [
    { value: "", label: "デフォルトカメラ" },
    ...cameraDevices.map((d) => ({ value: d.deviceId, label: d.label })),
  ];

  return (
    <div className="space-y-2">
      {/* Row 1: VRM / Camera / Tracking */}
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

        {cameraDevices.length > 1 && (
          <Select
            value={selectedCamera ?? ""}
            onValueChange={(v) => onSetSelectedCamera(v || null)}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="デフォルトカメラ">
                {(value) => cameraItems.find((i) => i.value === value)?.label ?? "デフォルトカメラ"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {cameraItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

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

      {/* Row 2: Display options */}
      <div className="flex flex-wrap items-center gap-2">
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
    </div>
  );
}

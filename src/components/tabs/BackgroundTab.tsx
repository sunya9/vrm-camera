import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Upload, X } from "lucide-react";
import {
  getUploadedBgList,
  addUploadedBg,
  removeUploadedBg,
  loadUploadedBgUrl,
  type UploadedBgItem,
} from "@/lib/vrm-cache";

const BG_COLOR_PRESETS = [
  { label: "透過", value: null },
  { label: "緑", value: "#00b140" },
  { label: "青", value: "#0047ab" },
  { label: "黒", value: "#000000" },
  { label: "白", value: "#ffffff" },
  { label: "グレー", value: "#808080" },
];

const BG_IMAGE_PRESETS = [
  { label: "オフィス", id: "photo-1497366216548-37526070297c" },
  { label: "デスク", id: "photo-1497215842964-222b430dc094" },
  { label: "ラウンジ", id: "photo-1524758631624-e2822e304c36" },
  { label: "リビング", id: "photo-1586023492125-27b2c045efd7" },
  { label: "本棚", id: "photo-1507842217343-583bb7270b66" },
  { label: "モダンリビング", id: "photo-1618221195710-dd6b41faaea6" },
  { label: "夜空", id: "photo-1507400492013-162706c8c05e" },
  { label: "霧の森", id: "photo-1448375240586-882707db888b" },
  { label: "サンセットビーチ", id: "photo-1507525428034-b723cf961d3e" },
  { label: "雪山", id: "photo-1464822759023-fed622ff2c3b" },
  { label: "桜", id: "photo-1522383225653-ed111181a951" },
  { label: "NY夜景", id: "photo-1514565131-fce0801e5785" },
  { label: "カフェ", id: "photo-1501339847302-ac426a4a7cbb" },
  { label: "星雲", id: "photo-1462331940025-496dfbfc7564" },
  { label: "図書館", id: "photo-1481627834876-b7833e8f5570" },
  { label: "サボテン", id: "photo-1459411552884-841db9b3cc2a" },
];

function unsplashUrl(id: string, w = 1280, h = 720) {
  return `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format`;
}

export type BgChange =
  | { type: "color"; color: string | null }
  | { type: "image"; url: string }
  | { type: "clear" };

interface BackgroundTabProps {
  bgColor: string | null;
  bgImage: string | null;
  onSetBackground: (change: BgChange) => void;
}

export function BackgroundTab({
  bgColor,
  bgImage,
  onSetBackground,
}: BackgroundTabProps) {
  const [uploadedItems, setUploadedItems] = useState<UploadedBgItem[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<Record<string, string>>({});

  // Load uploaded backgrounds on mount
  useEffect(() => {
    getUploadedBgList().then(async (list) => {
      setUploadedItems(list);
      const urls: Record<string, string> = {};
      for (const item of list) {
        const url = await loadUploadedBgUrl(item);
        if (url) urls[item.id] = url;
      }
      setUploadedUrls(urls);
    });
  }, []);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Reset input so the same file can be selected again
      e.target.value = "";
      const url = await addUploadedBg(file);
      const list = await getUploadedBgList();
      setUploadedItems(list);
      const item = list[list.length - 1];
      setUploadedUrls((prev) => ({ ...prev, [item.id]: url }));
      onSetBackground({ type: "image", url });
    },
    [onSetBackground],
  );

  const handleRemove = useCallback(async (id: string) => {
    await removeUploadedBg(id);
    setUploadedItems(await getUploadedBgList());
    setUploadedUrls((prev) => {
      const next = { ...prev };
      if (next[id]) {
        URL.revokeObjectURL(next[id]);
        delete next[id];
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-3">
      {/* Color presets */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">単色</span>
        {BG_COLOR_PRESETS.map((preset) => (
          <Tooltip key={preset.label}>
            <TooltipTrigger>
              <button
                type="button"
                onClick={() =>
                  onSetBackground(
                    preset.value !== null
                      ? { type: "color", color: preset.value }
                      : { type: "clear" },
                  )
                }
                className={cn(
                  "w-7 h-7 rounded-md border-2 text-[10px] flex items-center justify-center transition-colors",
                  bgColor === preset.value && !bgImage
                    ? "border-primary"
                    : "border-white/20 hover:border-white/50",
                )}
                style={{
                  backgroundColor: preset.value ?? "transparent",
                  backgroundImage: preset.value
                    ? undefined
                    : "linear-gradient(45deg, #555 25%, transparent 25%, transparent 75%, #555 75%), linear-gradient(45deg, #555 25%, transparent 25%, transparent 75%, #555 75%)",
                  backgroundSize: preset.value ? undefined : "8px 8px",
                  backgroundPosition: preset.value ? undefined : "0 0, 4px 4px",
                }}
              >
                {!preset.value && <span className="text-white">✕</span>}
              </button>
            </TooltipTrigger>
            <TooltipContent>{preset.label}</TooltipContent>
          </Tooltip>
        ))}
        <input
          type="color"
          value={bgColor ?? "#000000"}
          onChange={(e) =>
            onSetBackground({ type: "color", color: e.target.value })
          }
          className="w-7 h-7 rounded-md border-2 border-white/20 cursor-pointer bg-transparent"
        />
      </div>

      {/* Image presets + uploaded images */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">画像</span>
        <div className="py-2 flex gap-1.5 overflow-x-auto overflow-y-clip items-center">
          {/* Presets */}
          {BG_IMAGE_PRESETS.map((preset) => (
            <Tooltip key={preset.id}>
              <TooltipTrigger>
                <button
                  type="button"
                  onClick={() =>
                    onSetBackground({
                      type: "image",
                      url: unsplashUrl(preset.id),
                    })
                  }
                  className={cn(
                    "shrink-0 w-16 h-10 rounded-md border-2 overflow-hidden transition-colors",
                    bgImage?.includes(preset.id)
                      ? "border-primary"
                      : "border-white/20 hover:border-white/50",
                  )}
                >
                  <img
                    src={unsplashUrl(preset.id, 128, 80)}
                    alt={preset.label}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>{preset.label}</TooltipContent>
            </Tooltip>
          ))}

          {/* Uploaded images */}
          {uploadedItems.map((item) => (
            <div key={item.id} className="relative group shrink-0">
              <Tooltip>
                <TooltipTrigger>
                  <button
                    type="button"
                    onClick={() => {
                      const url = uploadedUrls[item.id];
                      if (url) onSetBackground({ type: "image", url });
                    }}
                    className={cn(
                      "w-16 h-10 rounded-md border-2 overflow-hidden transition-colors",
                      uploadedUrls[item.id] && bgImage === uploadedUrls[item.id]
                        ? "border-primary"
                        : "border-white/20 hover:border-white/50",
                    )}
                  >
                    {uploadedUrls[item.id] && (
                      <img
                        src={uploadedUrls[item.id]}
                        alt={item.fileName}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{item.fileName}</TooltipContent>
              </Tooltip>
              <button
                type="button"
                onClick={() => handleRemove(item.id)}
                className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-destructive text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}

          {/* Upload button */}
          <Button
            variant="secondary"
            size="sm"
            className="relative cursor-pointer shrink-0"
          >
            <Upload /> 追加
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </Button>
        </div>
      </div>
    </div>
  );
}

import type { LightingSettings } from "@/lib/vrm-scene";
import type { EffectSettings } from "@/lib/effects";
import type { LogEntry } from "@/lib/log-store";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Video,
  PersonStanding,
  PanelBottomOpen,
  PanelBottomClose,
} from "lucide-react";
import { ControlsTab } from "./tabs/ControlsTab";
import { BackgroundTab, type BgChange } from "./tabs/BackgroundTab";
import { EffectsTab } from "./tabs/EffectsTab";
import { LightingTab } from "./tabs/LightingTab";
import { ExpressionTab } from "./tabs/ExpressionTab";
import { LogTab } from "./tabs/LogTab";
import { AboutTab } from "./tabs/AboutTab";
import { cn } from "@/lib/utils";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

interface ControlTabsProps extends TabsPrimitive.Root.Props {
  vrmName: string | null;
  fps: number;
  tracking: boolean;
  handTracking: boolean;
  mirror: boolean;
  bgColor: string | null;
  bgImage: string | null;
  lighting: LightingSettings;
  showLightHelper: boolean;
  effects: EffectSettings;
  activeExpression: string | null;
  logs: LogEntry[];
  activeTab: string;

  onVRMUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleTracking: () => void;
  onSetMirror: (v: boolean) => void;
  onSetHandTracking: (v: boolean) => void;
  onSetBackground: (change: BgChange) => void;
  onSetLighting: (settings: LightingSettings) => void;
  onSetShowLightHelper: (v: boolean) => void;
  onSetEffects: (settings: EffectSettings) => void;
  onTriggerExpression: (name: string) => void;
  onResetPose: () => void;
  onResetCamera: () => void;
  isDetached?: boolean;
  onOpenControlPanel: () => void;
  onTabChange: (tab: string) => void;
  className?: string;
}

export function ControlTabs({
  activeTab,
  onTabChange,
  className,
  vrmName,
  fps,
  onResetCamera,
  onResetPose,
  onOpenControlPanel,
  isDetached,
  tracking,
  handTracking,
  mirror,
  onVRMUpload,
  onToggleTracking,
  onSetMirror,
  onSetHandTracking,
  bgColor,
  bgImage,
  onSetBackground,
  effects,
  onSetEffects,
  lighting,
  showLightHelper,
  onSetLighting,
  onSetShowLightHelper,
  activeExpression,
  onTriggerExpression,
  logs,
  ...props
}: ControlTabsProps) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={onTabChange}
      className={cn("w-full rounded-t-xl", className)}
      {...props}
    >
      <div className="flex items-center px-4 pt-2 gap-2 shrink-0 ">
        <TabsList variant="line">
          <TabsTrigger value="controls">コントロール</TabsTrigger>
          <TabsTrigger value="background">背景</TabsTrigger>
          <TabsTrigger value="effects">エフェクト</TabsTrigger>
          <TabsTrigger value="lighting">ライト</TabsTrigger>
          <TabsTrigger value="expression">表情</TabsTrigger>
          <TabsTrigger value="log">ログ</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <span>{vrmName}</span>
          <span>{fps} FPS</span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon" onClick={onResetCamera}>
                  <Video />
                </Button>
              }
            />
            <TooltipContent>カメラ位置をリセット</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon" onClick={onResetPose}>
                  <PersonStanding />
                </Button>
              }
            />
            <TooltipContent>ポーズをリセット</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onOpenControlPanel}
                >
                  {isDetached ? <PanelBottomClose /> : <PanelBottomOpen />}
                </Button>
              }
            />

            <TooltipContent>
              {isDetached
                ? "ウィンドウを閉じて統合"
                : "コントロールを別ウィンドウに分離"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="h-48 overflow-y-auto px-6 py-3">
        <TabsContent value="controls">
          <ControlsTab
            tracking={tracking}
            handTracking={handTracking}
            mirror={mirror}
            onVRMUpload={onVRMUpload}
            onToggleTracking={onToggleTracking}
            onSetMirror={onSetMirror}
            onSetHandTracking={onSetHandTracking}
          />
        </TabsContent>

        <TabsContent value="background">
          <BackgroundTab
            bgColor={bgColor}
            bgImage={bgImage}
            onSetBackground={onSetBackground}
          />
        </TabsContent>

        <TabsContent value="effects">
          <EffectsTab effects={effects} onSetEffects={onSetEffects} />
        </TabsContent>

        <TabsContent value="lighting">
          <LightingTab
            lighting={lighting}
            showLightHelper={showLightHelper}
            onSetLighting={onSetLighting}
            onSetShowLightHelper={onSetShowLightHelper}
          />
        </TabsContent>

        <TabsContent value="expression">
          <ExpressionTab
            activeExpression={activeExpression}
            onTriggerExpression={onTriggerExpression}
          />
        </TabsContent>

        <TabsContent value="log">
          <LogTab logs={logs} />
        </TabsContent>

        <TabsContent value="about">
          <AboutTab />
        </TabsContent>
      </div>
    </Tabs>
  );
}

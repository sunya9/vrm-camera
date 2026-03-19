import { ExternalLink, Github } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { isTauri } from "@/lib/platform";

const VERSION = __APP_VERSION__;
const REPO_URL = "https://github.com/sunya9/vrm-camera";

export function AboutTab() {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="VRM Camera" className="size-10" />
        <div>
          <h2 className="font-semibold text-foreground">VRM Camera</h2>
          <p className="text-xs text-muted-foreground">v{VERSION}{isTauri ? " (Desktop)" : " (Web)"}</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        VRMモデルをWebカメラでリアルタイムに動かすバーチャルカメラアプリ。
        MediaPipe による顔・体・手のトラッキングに対応。
      </p>

      <div className="flex flex-wrap gap-2">
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Github className="size-4" /> GitHub
          <ExternalLink className="size-3 ml-0.5 opacity-50" />
        </a>
        <a href={`${REPO_URL}/releases`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Releases
          <ExternalLink className="size-3 ml-0.5 opacity-50" />
        </a>
        <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Issues
          <ExternalLink className="size-3 ml-0.5 opacity-50" />
        </a>
      </div>

      <div className="text-[10px] text-muted-foreground/50 space-y-0.5">
        <p>Built with React, Three.js, @pixiv/three-vrm, MediaPipe</p>
        <p>MIT License</p>
      </div>
    </div>
  );
}

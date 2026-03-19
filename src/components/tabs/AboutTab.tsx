import { Github } from "lucide-react";
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

      <p className="text-xs leading-relaxed text-muted-foreground">
        VRMモデルをWebカメラでリアルタイムに動かすバーチャルカメラアプリです。
      </p>

      <div className="flex flex-wrap gap-2">
        <a
          href={REPO_URL}
          target="_blank"
          className={buttonVariants({ variant: "link", size: "sm" })}
        >
          <Github /> GitHub
        </a>
      </div>

      <div className="flex items-baseline gap-2 text-xs text-muted-foreground/50">
        <p>
          Created by{" "}
          <a
            target="_blank"
            href="https://x.com/ephemeralMocha"
            className="text-primary underline-offset-4 hover:underline"
          >
            @ephemeralMocha
          </a>
        </p>
        <p>MIT License</p>
      </div>
    </div>
  );
}

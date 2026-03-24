import { useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LogEntry } from "@/lib/log-store";

interface LogTabProps {
  logs: LogEntry[];
  showControls: boolean;
}

export function LogTab({ logs, showControls }: LogTabProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showControls) return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, showControls]);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-0.5 font-mono text-xs select-text">
        {logs.length === 0 && <div className="text-muted-foreground">ログはまだありません</div>}
        {logs.map((entry) => (
          <div key={entry.id} className="flex gap-2">
            <span className=" shrink-0">{entry.time}</span>
            <span>{entry.message}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}

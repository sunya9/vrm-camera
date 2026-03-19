import { useState, useCallback } from "react";

export interface LogEntry {
  id: string;
  time: string;
  message: string;
}

export function useLogStore() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((message: string) => {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString("ja-JP"),
      message,
    };
    setLogs((prev) => [...prev.slice(-99), entry]);
  }, []);

  return { logs, addLog };
}

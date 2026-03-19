import { useState, useEffect } from "react";

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(`vrm-camera:${key}`);
      return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`vrm-camera:${key}`, JSON.stringify(value));
    } catch {
      // storage full or unavailable
    }
  }, [key, value]);

  return [value, setValue];
}

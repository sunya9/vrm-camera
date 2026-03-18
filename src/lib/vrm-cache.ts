import { get, set, del, createStore } from "idb-keyval";

const store = createStore("vrm-cache", "files");

const META_KEY = "meta";
const VRM_KEY = "vrm";

interface CacheMeta {
  fileName: string;
  size: number;
  cachedAt: string;
}

export async function cacheVRM(file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  const meta: CacheMeta = {
    fileName: file.name,
    size: file.size,
    cachedAt: new Date().toISOString(),
  };
  await set(VRM_KEY, buffer, store);
  await set(META_KEY, meta, store);
}

export async function loadCachedVRM(): Promise<{ url: string; fileName: string } | null> {
  try {
    const meta = await get<CacheMeta>(META_KEY, store);
    if (!meta) return null;

    const buffer = await get<ArrayBuffer>(VRM_KEY, store);
    if (!buffer) return null;

    const blob = new Blob([buffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    return { url, fileName: meta.fileName };
  } catch {
    return null;
  }
}

export async function clearCachedVRM(): Promise<void> {
  await del(VRM_KEY, store);
  await del(META_KEY, store);
}

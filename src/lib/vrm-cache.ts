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

// --- Background image cache ---

const BG_KEY = "bg-image";
const BG_META_KEY = "bg-meta";

interface BgMeta {
  fileName: string;
  mimeType: string;
}

export async function cacheBgImage(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const meta: BgMeta = { fileName: file.name, mimeType: file.type };
  await set(BG_KEY, buffer, store);
  await set(BG_META_KEY, meta, store);
  return URL.createObjectURL(file);
}

export async function loadCachedBgImage(): Promise<string | null> {
  try {
    const meta = await get<BgMeta>(BG_META_KEY, store);
    if (!meta) return null;
    const buffer = await get<ArrayBuffer>(BG_KEY, store);
    if (!buffer) return null;
    const blob = new Blob([buffer], { type: meta.mimeType });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function clearCachedBgImage(): Promise<void> {
  await del(BG_KEY, store);
  await del(BG_META_KEY, store);
}

// --- User uploaded background images ---

const UPLOADED_BG_LIST_KEY = "uploaded-bg-list";

export interface UploadedBgItem {
  id: string;
  fileName: string;
  mimeType: string;
}

export async function getUploadedBgList(): Promise<UploadedBgItem[]> {
  return (await get<UploadedBgItem[]>(UPLOADED_BG_LIST_KEY, store)) ?? [];
}

export async function addUploadedBg(file: File): Promise<string> {
  const id = crypto.randomUUID();
  const buffer = await file.arrayBuffer();
  const item: UploadedBgItem = { id, fileName: file.name, mimeType: file.type };

  await set(`uploaded-bg-${id}`, buffer, store);

  const list = await getUploadedBgList();
  list.push(item);
  await set(UPLOADED_BG_LIST_KEY, list, store);

  return URL.createObjectURL(file);
}

export async function removeUploadedBg(id: string): Promise<void> {
  await del(`uploaded-bg-${id}`, store);
  const list = await getUploadedBgList();
  await set(UPLOADED_BG_LIST_KEY, list.filter((i) => i.id !== id), store);
}

export async function loadUploadedBgUrl(item: UploadedBgItem): Promise<string | null> {
  const buffer = await get<ArrayBuffer>(`uploaded-bg-${item.id}`, store);
  if (!buffer) return null;
  return URL.createObjectURL(new Blob([buffer], { type: item.mimeType }));
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TAURI: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

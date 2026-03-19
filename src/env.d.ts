/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_TAURI: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

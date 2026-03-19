import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig(({ mode }) => ({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/@mediapipe/tasks-vision/wasm/*",
          dest: "mediapipe/wasm",
        },
      ],
    }),
  ],
  base: mode === "tauri" ? "/" : "/vrm-camera/",
}));

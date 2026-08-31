import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: ".",
  resolve: {
    alias: {
      "@preframe/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
});

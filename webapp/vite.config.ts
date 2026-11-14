import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// No secrets here: only VITE_* vars reach the bundle, and none are used.
export default defineConfig({
  root: path.resolve(import.meta.dirname),
  plugins: [tailwindcss()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5173, proxy: { "/api": "http://localhost:8080", "/dl": "http://localhost:8080" } },
});

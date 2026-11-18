import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    cors: {
      origin: "https://www.owlbear.rodeo",
    },
    strictPort: true
  },
  define: {
    __API_BASE_URL__: JSON.stringify(process.env.VITE_API_BASE_URL || "http://localhost:5173"),
  },
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        background: resolve(import.meta.dirname, "background.html"),
      },
    },
  },
});
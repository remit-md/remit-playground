import { defineConfig } from "vite";

export default defineConfig({
  base: "/remit-playground/",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: { main: "index.html" },
    },
  },
});

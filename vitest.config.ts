import { defineConfig } from "vitest/config";

export default defineConfig({
  // Boundary tests run without the app's development WebSocket server.
  server: { hmr: false },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});

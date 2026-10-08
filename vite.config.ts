import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localTelegramPlugin } from "./server/localTelegramPlugin";

export default defineConfig({
  plugins: [react(), localTelegramPlugin()],
  server: { host: "127.0.0.1", port: 5178, strictPort: true },
});

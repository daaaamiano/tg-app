import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const web = spawnSync("npm", ["run", "build", "--", "--base", "/"], {
  stdio: "inherit",
  env: { ...process.env, VITE_PRIVATE_SERVICE: "true", VITE_DATA_SOURCE: "mock", VITE_API_BASE_URL: "" },
});
if (web.status !== 0) process.exit(web.status ?? 1);
await build({ entryPoints: ["src/telegramSignin.ts"], outfile: "dist/signin.js", bundle: true, platform: "browser", format: "iife", target: "es2022", minify: true });
await mkdir("dist-server", { recursive: true });
await build({ entryPoints: ["server/index.ts"], outfile: "dist-server/index.mjs", bundle: true, platform: "node", format: "esm", target: "node22", packages: "external" });
await writeFile("dist/.private-service.json", JSON.stringify({ privateService: true }));
console.log("Private app and Node API built. Start with npm start.");

import { build } from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["run", "build:service"], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
const output = ".vercel/output";
const fn = `${output}/functions/private.func`;
await rm(output, { recursive: true, force: true });
await mkdir(fn, { recursive: true });
await build({ entryPoints: ["server/vercel.ts"], outfile: `${fn}/handler.cjs`, bundle: true, platform: "node", format: "cjs", target: "node22", footer: { js: "module.exports = module.exports.default;" } });
await cp("dist", `${fn}/private`, { recursive: true });
await writeFile(`${fn}/.vc-config.json`, JSON.stringify({
  runtime: "nodejs22.x", handler: "handler.cjs", launcherType: "Nodejs", shouldAddHelpers: false,
  maxDuration: 120, regions: ["fra1"],
}));
await writeFile(`${output}/config.json`, JSON.stringify({ version: 3, routes: [{ src: "/(.*)", dest: "/private" }] }));
// Deliberately no output/static directory: every event file stays inside the function.
console.log("Vercel function built with private assets; no public event/static output.");

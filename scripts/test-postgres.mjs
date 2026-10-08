import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { spawnSync } from "node:child_process";

// Requires a local PostgreSQL installation. Never touches an existing service/database.
const directory = await mkdtemp(`${tmpdir()}/ropelab-postgres-test-`);
const data = `${directory}/data`;
const run = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, { encoding: "utf8", ...options });
  if (result.error || result.status !== 0) throw new Error(`${cmd} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  return result;
};
let started = false;
try {
  run("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "--no-locale"]);
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  run("pg_ctl", ["-D", data, "-l", `${directory}/server.log`, "-o", `-h 127.0.0.1 -p ${port} -k ${directory}`, "-w", "start"]);
  started = true;
  const url = `postgresql://postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
  const env = { ...process.env, DATABASE_URL: url, TEST_DATABASE_URL: url };
  run("npm", ["run", "db:setup"], { env, stdio: "inherit" });
  run("npm", ["test"], { env, stdio: "inherit" });
  run("npm", ["run", "verify:vercel"], { env, stdio: "inherit" });
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  await rm(directory, { recursive: true, force: true });
}

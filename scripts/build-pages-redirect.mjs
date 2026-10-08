import { mkdir, rm, writeFile } from "node:fs/promises";

// GitHub Pages must never receive the private event bundle or its assets.
const output = new URL("../dist-pages/", import.meta.url);
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0;url=https://ropelab.vercel.app/">
  <title>RopeLab sign in</title>
</head>
<body>
  <p><a href="https://ropelab.vercel.app/">Continue to RopeLab</a></p>
  <script>location.replace("https://ropelab.vercel.app/" + location.hash);</script>
</body>
</html>
`;
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(["index.html", "404.html"].map((name) => writeFile(new URL(name, output), html)));

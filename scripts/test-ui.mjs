import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(
  new URL("../artifacts/api-server/package.json", import.meta.url),
);
const { build } = require("esbuild");
await build({
  entryPoints: ["artifacts/2blea-radar/src/App.tsx"],
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  jsx: "automatic",
  loader: { ".css": "empty" },
  outfile: "artifacts/2blea-radar/.test-output/app.mjs",
});
await build({
  external: ["./app.mjs"],
  entryPoints: ["artifacts/2blea-radar/tests/ui.test.tsx"],
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  jsx: "automatic",
  loader: { ".css": "empty" },
  outfile: "artifacts/2blea-radar/.test-output/ui.test.mjs",
});
const result = spawnSync(
  process.execPath,
  ["--test", "artifacts/2blea-radar/.test-output/ui.test.mjs"],
  { stdio: "inherit" },
);
process.exitCode = result.status || 0;

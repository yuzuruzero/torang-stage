/**
 * Build app theater: esbuild membundel main + preload (cjs, node) dan
 * renderer (iife, browser), lalu menyalin HTML ke dist/.
 */
import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("dist/renderer", { recursive: true });

const node = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"],
  sourcemap: "inline",
  logLevel: "warning",
};

await build({ ...node, entryPoints: ["src/main/main.ts"], outfile: "dist/main.cjs" });
await build({ ...node, entryPoints: ["src/main/preload.ts"], outfile: "dist/preload.cjs" });

const browser = {
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome120",
  sourcemap: "inline",
  logLevel: "warning",
};

for (const name of ["tv", "panel", "login", "overlay", "glow"]) {
  await build({
    ...browser,
    entryPoints: [`src/renderer/${name}.ts`],
    outfile: `dist/renderer/${name}.js`,
  });
  cpSync(`src/renderer/${name}.html`, `dist/renderer/${name}.html`);
}

console.log("[build] theater siap → dist/");

import { copyFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir("public/assets", { recursive: true });
await build({
  entryPoints: ["public/app-src.js"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: "public/assets/app.js",
});
await Promise.all([
  copyFile("assets/style.css", "public/assets/style.css"),
  copyFile("assets/theme.js", "public/assets/theme.js"),
]);

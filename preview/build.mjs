// Builds a single self-contained HTML preview of the app: dist-preview/index.html.
// Uses the real components; only next/link and next/navigation are shimmed.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "dist-preview");
mkdirSync(out, { recursive: true });

const js = await build({
  entryPoints: [resolve(root, "preview/main.tsx")],
  bundle: true,
  write: false,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  tsconfig: resolve(root, "tsconfig.json"),
  // The preview has no server: run the API and the rule-based Atlas in the browser.
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_DATA_MODE": '"local"' },
  alias: {
    "next/link": resolve(root, "preview/shims/next-link.tsx"),
    "next/navigation": resolve(root, "preview/shims/next-navigation.ts"),
  },
  logLevel: "error",
});

const cssFile = resolve(out, "app.css");
execFileSync("npx", ["@tailwindcss/cli", "-i", "src/app/globals.css", "-o", cssFile, "--minify"], { cwd: root, stdio: "ignore" });
const css = readFileSync(cssFile, "utf8");

const code = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="theme-color" content="#1C2230">
<title>Meld preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>:root{--font-inter:"Inter"}${css}</style>
</head>
<body class="h-full font-sans">
<div id="root" class="h-full"></div>
<script>${code}</script>
</body>
</html>
`;
writeFileSync(resolve(out, "index.html"), html);
console.log(`dist-preview/index.html ${(html.length / 1024).toFixed(0)} KB`);

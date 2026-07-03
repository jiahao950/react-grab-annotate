import { build } from "esbuild";
import { rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });

// Browser client. The dynamic `import("react-grab/core")` becomes a lazily
// loaded chunk, so importing dist/client.js runs no side effects and pulls in
// nothing until <ReactGrabAnnotate/> actually mounts. react-grab (with its
// inlined solid-js/bippy) is bundled into that chunk — no runtime dependency.
await build({
  entryPoints: ["src/client.tsx"],
  outdir: "dist",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  jsx: "automatic",
  external: ["react", "react-dom", "react/jsx-runtime"],
  banner: { js: '"use client";' },
  // Not minified on purpose: re-minifying react-grab's already-built snapDOM
  // bundle corrupts its canvas/rasterization pipeline (blank/broken PNGs).
  minify: false,
  legalComments: "none",
});

// Node server (also imported by the bin). No third-party deps, so nothing to
// bundle beyond our own files; node built-ins stay external.
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/server.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: ["node18"],
  packages: "external",
});

process.stdout.write("react-grab-annotate: build complete (dist/client.js, dist/server.js)\n");

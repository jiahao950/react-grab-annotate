# `react-grab-annotate` — distribution & integration design

Decisions locked in:

1. **One published npm package: `react-grab-annotate`** (rename of the current
   `@react-grab/annotate-server`). Published to npm (OAuth-assisted).
2. **Server is standalone and framework-agnostic** — a local HTTP server on its
   own port, run by the user. It is **not** coupled to Next.js. We only ship a
   runnable bin; the user ties its lifecycle to their dev server by adding one
   line to their `dev` script.
3. **Client is import-safe** — the user imports a component and renders it to
   initialize. Importing the package must have **zero global side effects**
   (no `window` writes, no react-grab auto-init). Nothing happens until the
   component mounts. The user owns environment gating.

This is a design doc — no implementation yet.

---

## 1. Package shape

`react-grab-annotate` has two audiences (Node server, browser client) behind
separate entry points so neither pulls in the other:

```
react-grab-annotate
├── exports "."          → browser: React component <ReactGrabAnnotate/>   (import-safe)
├── exports "./server"   → node: programmatic server API (startAnnotateServer, handler, storage)
└── bin  react-grab-annotate → node: runs the local server (what users put in their dev script)
```

`package.json` (sketch):
```jsonc
{
  "name": "react-grab-annotate",
  "type": "module",
  "bin": { "react-grab-annotate": "./bin/server.mjs" },
  "exports": {
    ".":        { "types": "./dist/client.d.ts", "import": "./dist/client.js" },
    "./server": { "types": "./dist/server.d.ts", "import": "./dist/server.js" }
  },
  "peerDependencies": { "react": ">=17" },
  "peerDependenciesMeta": { "react": { "optional": true } }
}
```

The forked react-grab (which contains the annotate feature) is **bundled** into
the client build — see §4 — so consumers install only `react-grab-annotate`.

---

## 2. Server (Node) — unchanged in spirit, just repackaged

Same code as today (`storage.ts` + `markdown.ts` + the http server), exposed as
a bin. No Next awareness.

- Own port (default `5179`), `127.0.0.1`, CORS enabled (cross-origin: dev app on
  `:3000`, server on `:5179`).
- Writes to `process.cwd()/.react-grab-annotations/<session>/` → the target
  project, because the user runs it from the project root.
- Prunes sessions older than 1 day on startup (already implemented).

**User wiring (the one line they add):**
```jsonc
// target project package.json
"scripts": {
  "dev": "concurrently \"next dev\" \"react-grab-annotate\""
}
```
That satisfies "同开同关" without us coupling to Next. We document `concurrently`
/ `npm-run-all` but ship nothing framework-specific.

Refactor still worth doing: extract routing into a transport-agnostic
`handleAnnotateRequest(config, req) → { status, json }` under `./server`, so the
http server is a thin shell and the logic is reusable/testable. (No Next
adapter needed anymore.)

---

## 3. Client (browser) — the import-safety contract

The `.` entry exports a React component. The **hard rule**: importing this entry
runs no side effects.

```tsx
// src/client.tsx
"use client";
import { useEffect } from "react";

export interface ReactGrabAnnotateProps {
  /** Where the local server is. Default "http://localhost:5179". */
  serverUrl?: string;
  /** Escape hatch; the user normally gates by not rendering at all. Default true. */
  enabled?: boolean;
}

export const ReactGrabAnnotate = (props: ReactGrabAnnotateProps): null => {
  useEffect(() => {
    if (props.enabled === false) return;
    let disposed = false;
    let api: { dispose?: () => void } | undefined;

    // Loaded lazily so (a) importing this module is side-effect-free and
    // (b) react-grab is never evaluated during SSR — only after mount, client-side.
    import("react-grab/core").then(({ init }) => {
      if (disposed) return;
      api = init({ annotate: { serverUrl: props.serverUrl ?? "http://localhost:5179" } });
    });

    return () => {
      disposed = true;
      api?.dispose?.();
    };
  }, [props.serverUrl, props.enabled]);

  return null;
};
```

Why this is import-safe and SSR-safe:

- The module's only static import is `react` (`useEffect`). **No top-level
  import of react-grab**, so evaluating this module mutates nothing.
- react-grab is reached via `import("react-grab/core")` **inside the effect** —
  effects run only on the client after mount, so Next SSR never evaluates
  react-grab, and nothing loads until the component is actually rendered.
- We import `react-grab/core` (which merely *defines* `init`), **not**
  `react-grab` (whose top-level auto-init side effect at `index.ts` is the
  "dirty global" we must avoid). Even so, the dynamic-import-in-effect keeps us
  safe regardless.
- Cleanup calls `api.dispose()` so unmount tears the overlay down cleanly.

**User gates the environment themselves**, e.g.:
```tsx
// app/layout.tsx (Next) — user's code
{process.env.NODE_ENV === "development" && <ReactGrabAnnotate />}
```
`process.env.NODE_ENV === "development"` is compiled to `false` in prod builds,
so the component (and the whole react-grab chunk) is dead-code-eliminated.

We provide the guarantee (safe import); the user provides the decision (whether
to render).

---

## 4. Bundling the annotate-enabled react-grab

The annotate feature is baked into the forked react-grab core in this monorepo,
so `react-grab-annotate` must ship it. The public `react-grab` on npm is someone
else's package and does **not** have `{ annotate }`, so we cannot depend on it —
we **bundle our fork's `core` into the client build**.

- In the monorepo, `react-grab-annotate` build-depends on the workspace
  `react-grab` (`workspace:*`) and inlines `react-grab/core` into
  `dist/client.js`'s lazy chunk (bundler `deps` inline / no `external`).
- The published package therefore has **no runtime dependency** on `react-grab`
  and is self-contained.
- Two build targets: browser ESM (`client`, bundles react-grab core + solid) and
  Node ESM (`server` + `bin`). They must not cross-import.
- Attribution: react-grab is MIT (© aidenybai) — keep its license/notice in the
  bundle metadata.

Trade-off: the react-grab code is duplicated if the consumer also uses
`react-grab` directly. Acceptable for a dev-only tool.

---

## 5. Monorepo layout after the rename

```
packages/
├── react-grab/            (fork; annotate feature lives here, internal build source)
└── react-grab-annotate/   (was annotate-server) — the PUBLISHED package
    ├── src/
    │   ├── client.tsx      "." entry — React component (import-safe)
    │   ├── server.ts       "./server" entry — startAnnotateServer + handler
    │   ├── handler.ts      transport-agnostic routing (extracted)
    │   ├── storage.ts      (exists) pure FS writes + startup prune
    │   ├── markdown.ts     (exists)
    │   └── index.ts        server bin entry (arg/env parsing)
    ├── bin/server.mjs
    └── package.json        name: "react-grab-annotate", exports as §1
```

`packages/react-grab` itself: we are NOT publishing our fork; it's an internal
source that `react-grab-annotate` bundles. (If upstream ever gains an `annotate`
extension point, this could become a thin plugin instead of a bundled fork.)

---

## 6. End-to-end consumer story (Next.js target)

```
pnpm add -D react-grab-annotate concurrently
```
```jsonc
// package.json
"scripts": { "dev": "concurrently \"next dev\" \"react-grab-annotate\"" }
```
```tsx
// app/layout.tsx
import { ReactGrabAnnotate } from "react-grab-annotate";
export default function RootLayout({ children }) {
  return (
    <html><body>
      {children}
      {process.env.NODE_ENV === "development" && <ReactGrabAnnotate />}
    </body></html>
  );
}
```
```
# .gitignore
.react-grab-annotations/
```

`pnpm dev` → Next on `:3000`, annotate server on `:5179`, overlay injected in
dev only, annotations written to `<project>/.react-grab-annotations/`. Submit
copies the AI prompt pointing at `annotations.md`.

---

## 7. Correctness checklist for implementation

- [ ] `react-grab-annotate` `.` entry has **no** top-level side effects and no
      top-level react-grab import (smoke test: import the entry in a bare
      Node/JSDOM context, confirm `window.__REACT_GRAB__` stays unset).
- [ ] Client component is `"use client"` and only loads react-grab in `useEffect`
      (SSR-safe).
- [ ] `dispose()` on unmount; no leaked listeners/overlay.
- [ ] Server bin runs from compiled `dist` (no `tsx` in the published package).
- [ ] `.react-grab-annotations/` documented for the consumer's `.gitignore`.
- [ ] Concurrency: add a per-`sessionId` in-process write mutex in `storage.ts`
      (async saves can overlap).
- [ ] CORS stays enabled (cross-origin :3000 → :5179).
- [ ] Default `serverUrl` = `http://localhost:5179`; overridable via prop.

---

## 8. Open questions

1. **Component API**: single `<ReactGrabAnnotate serverUrl enabled/>` (shown), or
   also expose an imperative `startAnnotate(options) → dispose` for non-React
   hosts?
2. **Port config**: hard default `5179` on both sides, or read a shared value
   (env / config file) so custom ports don't require editing two places?
3. **Version coupling**: `react-grab-annotate` version scheme — independent, or
   pinned to the react-grab it bundles?

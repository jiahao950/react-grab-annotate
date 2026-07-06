# react-grab-annotate

Annotate a running React app right in the browser — select or box-select any
element, write a comment — and it's saved to your project as
**screenshot + source location (`file:line`) + comment**.
Hand the result to an AI coding agent and it knows exactly what to change and
where.

Built on [react-grab](https://github.com/aidenybai/react-grab)'s element
selection + source resolution.

---

## How it works

Two pieces run only during local development:

1. **A tiny local server** (this package's `bin`) that writes annotations to
   disk in your project.
2. **A React component** you render in dev that shows the annotation overlay in
   the browser and talks to that server.

```
you (browser)  ──select + comment──▶  <ReactGrabAnnotate/>  ──HTTP──▶  local server
                                                                          │
                                                                          ▼
                                       <your-project>/.react-grab/
                                         ├─ manifest.json          (session index, for cleanup)
                                         └─ <session>/
                                            ├─ image-1.png         (snapDOM screenshot)
                                            └─ annotations.md      (what you paste to the AI)
```

---

## Setup (≈2 minutes)

### 1. Install

```bash
pnpm add -D react-grab-annotate concurrently
```

### 2. Start the server together with your dev server

Add it to your `dev` script — it's a plain local server, not tied to any
framework, so `concurrently` (or `npm-run-all`) is all you need:

```jsonc
// package.json
{
  "scripts": {
    "dev": "concurrently \"next dev\" \"react-grab-annotate\""
  }
}
```

Replace `next dev` with whatever your dev command is (`vite`, `react-scripts
start`, …). The server runs in your project root and writes there.

### 3. Render the overlay — dev only

```tsx
// e.g. app/layout.tsx (Next.js App Router)
import { ReactGrabAnnotate } from "react-grab-annotate";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        {process.env.NODE_ENV === "development" && <ReactGrabAnnotate />}
      </body>
    </html>
  );
}
```

> **You** decide when it loads. Gate it however you like (usually `NODE_ENV`).
> Importing this package is side-effect-free — nothing runs, and no globals are
> touched, until the component actually mounts. In production the guarded branch
> is compiled away, so none of it ships to users.

### 4. Ignore the output directory

```gitignore
# .gitignore
.react-grab/
```

Run `pnpm dev` and you're set.

---

## Using it

- **Enter annotation mode:** click the floating **标注** button (bottom-right),
  or press `Cmd/Ctrl + Enter`.
- **Annotate:** click an element _or_ drag a box over a region, then type a
  comment and press `Enter`. A numbered mark pins to that spot and follows it as
  you scroll.
- **Review / edit:** click a mark to open its card (source location, screenshot,
  comment) — edit or delete.
- **Submit:** press `Cmd/Ctrl + C` (or the Submit button). Marks clear, and your
  clipboard gets a prompt like:
  > 我把 3 条标注信息保存到 …/annotations.md，你读完之后进行项目修改。

  Paste that to your AI agent.
- **Leave without submitting:** the **取消** button (no shortcut, on purpose).

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + Enter` | Enter annotation mode |
| `Cmd/Ctrl + C` | Submit (only while active; normal copy otherwise) |
| `Esc` | Close the comment popup (stays in annotation mode) |

---

## API

### `<ReactGrabAnnotate />` (default export, browser)

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `serverUrl` | `string` | `http://localhost:5179` | Where the local server listens. |
| `enabled` | `boolean` | `true` | Escape hatch; prefer not rendering it instead. |
| `ignoreComponents` | `string[]` | `[]` | Component names to treat as transparent wrappers — see below. |

#### Transparent wrappers (`ignoreComponents`)

Shared components that clone their child during render (floating-ui
`Tooltip`/`Popover`, most HOCs) become that child's React *owner*, so selecting
the child would resolve to the wrapper (e.g. `Tooltip`) instead of the component
that authored it (e.g. `NavBarTabItem`). That's how React attributes ownership
of `cloneElement`'d children — React DevTools shows the same.

A built-in set is skipped automatically — floating-ui / radix overlay wrappers
(`Tooltip`, `Popover`, `Dropdown`, `HoverCard`, `ContextMenu`, `Portal`, `Slot`,
`Trigger`, …), framer-motion internals (`AnimatePresence`, `PopChild`, …), and
common base UI primitives that wrap/clone their children (`IconButton`,
`Select`, `Tabs`, `DropdownMenu`, overflow-text helpers, …). Add your own to
skip them too:

```tsx
<ReactGrabAnnotate ignoreComponents={["MyTooltip", "WithPermission", "Field"]} />
```

### `startAnnotate(options?)` (browser, non-React hosts)

```ts
import { startAnnotate } from "react-grab-annotate";
const handle = startAnnotate({ serverUrl: "http://localhost:5179" });
// later: handle.dispose();
```

### The server bin — `react-grab-annotate`

| Flag | Env | Default |
| --- | --- | --- |
| `--port` | `ANNOTATE_PORT` | `5179` |
| `--host` | `ANNOTATE_HOST` | `127.0.0.1` |
| `--dir` | `ANNOTATE_DIR` | `process.cwd()` |
| `--base-dir` | `ANNOTATE_BASE_DIR` | `.react-grab` |

Sessions older than 1 day are pruned on startup. Programmatic use:
`import { startAnnotateServer } from "react-grab-annotate/server"`.

If you change the port, pass it to both sides:
`react-grab-annotate --port 6000` and `<ReactGrabAnnotate serverUrl="http://localhost:6000" />`.

---

## Notes

- **Dev-only tool.** Keep it behind an environment gate; don't ship it to
  production.
- **Self-contained.** react-grab (and its deps) are bundled in — you only
  install `react-grab-annotate`. `react` is a peer dependency.
- **Cross-origin.** The app (e.g. `:3000`) and the server (`:5179`) are
  different origins; the server sends permissive CORS headers for localhost dev.

## License

MIT. Bundles [react-grab](https://github.com/aidenybai/react-grab) (MIT, © Aiden Bai).

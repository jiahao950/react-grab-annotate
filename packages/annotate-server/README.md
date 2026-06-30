# @react-grab/annotate-server

Local API server that persists react-grab annotations to disk so an AI agent can read them.

When react-grab runs in annotation mode (`init({ annotate: true })`), each submitted
annotation (screenshot + source location + component stack + comment) is POSTed here and
written under `<project>/.react-grab-annotations/<session>/`:

- `image-<n>-<id>.png` — snapDOM screenshot of the annotated element
- `manifest.json` — structured record of every annotation in the session
- `annotations.md` — human/AI-readable summary (source location, screenshot, comment)

## Run

```bash
pnpm --filter @react-grab/annotate-server start
# or, after build:
npx react-grab-annotate-server --port 5179 --dir /path/to/project
```

Configuration (flags or env):

| Flag         | Env                 | Default                   |
| ------------ | ------------------- | ------------------------- |
| `--port`     | `ANNOTATE_PORT`     | `5179`                    |
| `--host`     | `ANNOTATE_HOST`     | `127.0.0.1`               |
| `--dir`      | `ANNOTATE_DIR`      | `process.cwd()`           |
| `--base-dir` | `ANNOTATE_BASE_DIR` | `.react-grab-annotations` |

Point react-grab at a non-default URL with `init({ annotate: { serverUrl: "http://127.0.0.1:5179" } })`.

## API

- `GET  /health`
- `POST /api/annotations` — `{ sessionId, annotation, imageBase64 }`
- `PUT  /api/annotations/:id` — `{ sessionId, comment?, imageBase64? }`
- `DELETE /api/annotations/:id?sessionId=...`
- `POST /api/sessions/:id/submit` — flush markdown, returns `{ markdownPath, count }`

All responses are JSON with permissive CORS so the in-page tool can reach `localhost`.

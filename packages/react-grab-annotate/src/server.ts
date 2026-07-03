import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  cleanupStaleSessions,
  deleteAnnotation,
  saveAnnotation,
  submitSession,
  updateAnnotation,
} from "./storage.js";
import type { SaveAnnotationRequest, ServerConfig, UpdateAnnotationRequest } from "./types.js";

const MAX_BODY_BYTES = 32 * 1024 * 1024;

const sendJson = (response: ServerResponse, status: number, payload: unknown): void => {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(body);
};

const readJsonBody = <T>(request: IncomingMessage): Promise<T> =>
  new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    request.on("data", (chunk: Buffer) => {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_BODY_BYTES) {
        rejectPromise(new Error("Request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolvePromise(raw ? JSON.parse(raw) : ({} as T));
      } catch (error) {
        rejectPromise(error instanceof Error ? error : new Error("Invalid JSON body"));
      }
    });
    request.on("error", rejectPromise);
  });

const handleRequest = async (
  config: ServerConfig,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const method = request.method ?? "GET";
  if (method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", "http://localhost");
  const segments = url.pathname.split("/").filter(Boolean);

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true, rootDir: config.rootDir, baseDir: config.baseDir });
    return;
  }

  // POST /api/annotations
  if (method === "POST" && url.pathname === "/api/annotations") {
    const payload = await readJsonBody<SaveAnnotationRequest>(request);
    if (!payload.sessionId || !payload.annotation) {
      sendJson(response, 400, { error: "sessionId and annotation are required" });
      return;
    }
    const result = await saveAnnotation(
      config,
      payload.sessionId,
      payload.annotation,
      payload.imageBase64,
    );
    sendJson(response, 200, {
      ok: true,
      id: result.annotation.id,
      screenshotFile: result.annotation.screenshotFile,
      sessionDir: result.sessionDir,
      markdownPath: result.markdownPath,
    });
    return;
  }

  // PUT /api/annotations/:id  &  DELETE /api/annotations/:id
  if (segments[0] === "api" && segments[1] === "annotations" && segments[2]) {
    const annotationId = decodeURIComponent(segments[2]);
    if (method === "PUT") {
      const payload = await readJsonBody<UpdateAnnotationRequest>(request);
      if (!payload.sessionId) {
        sendJson(response, 400, { error: "sessionId is required" });
        return;
      }
      const updated = await updateAnnotation(
        config,
        payload.sessionId,
        annotationId,
        payload.comment,
        payload.imageBase64,
      );
      if (!updated) {
        sendJson(response, 404, { error: "annotation not found" });
        return;
      }
      sendJson(response, 200, { ok: true, annotation: updated });
      return;
    }
    if (method === "DELETE") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) {
        sendJson(response, 400, { error: "sessionId query param is required" });
        return;
      }
      const removed = await deleteAnnotation(config, sessionId, annotationId);
      sendJson(response, removed ? 200 : 404, { ok: removed });
      return;
    }
  }

  // POST /api/sessions/:id/submit
  if (
    method === "POST" &&
    segments[0] === "api" &&
    segments[1] === "sessions" &&
    segments[2] &&
    segments[3] === "submit"
  ) {
    const sessionId = decodeURIComponent(segments[2]);
    const result = await submitSession(config, sessionId);
    sendJson(response, 200, {
      ok: true,
      markdownPath: result.markdownPath,
      sessionDir: result.sessionDir,
      count: result.count,
    });
    return;
  }

  sendJson(response, 404, { error: "not found" });
};

export const startAnnotateServer = (config: ServerConfig): ReturnType<typeof createServer> => {
  const server = createServer((request, response) => {
    handleRequest(config, request, response).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "internal error";
      sendJson(response, 500, { error: message });
    });
  });
  server.listen(config.port, config.host, () => {
    process.stdout.write(
      `[react-grab annotate] listening on http://${config.host}:${config.port}\n` +
        `[react-grab annotate] writing to ${config.rootDir}/${config.baseDir}\n`,
    );
    // Prune annotation sessions older than a day so the output directory does
    // not grow unbounded across runs.
    cleanupStaleSessions(config)
      .then((removedCount) => {
        if (removedCount > 0) {
          process.stdout.write(`[react-grab annotate] pruned ${removedCount} stale session(s)\n`);
        }
      })
      .catch(() => {});
  });
  return server;
};

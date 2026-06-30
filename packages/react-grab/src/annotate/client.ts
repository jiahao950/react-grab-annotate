import { logRecoverableError } from "../utils/log-recoverable-error.js";
import type { Annotation } from "./types.js";

interface SaveResponse {
  ok: boolean;
  id: string;
  screenshotFile: string | null;
  sessionDir: string;
  markdownPath: string;
}

interface SubmitResponse {
  ok: boolean;
  markdownPath: string;
  sessionDir: string;
  count: number;
}

const buildAnnotationPayload = (annotation: Annotation) => ({
  id: annotation.id,
  number: annotation.number,
  comment: annotation.comment,
  filePath: annotation.filePath,
  lineNumber: annotation.lineNumber,
  componentName: annotation.componentName,
  tagName: annotation.tagName,
  selector: annotation.selector,
  stackContext: annotation.stackContext,
  bounds: annotation.bounds,
  url: annotation.url,
});

export interface AnnotateClient {
  save: (sessionId: string, annotation: Annotation) => Promise<SaveResponse | null>;
  update: (
    sessionId: string,
    annotationId: string,
    comment: string,
    imageBase64?: string | null,
  ) => Promise<boolean>;
  remove: (sessionId: string, annotationId: string) => Promise<boolean>;
  submit: (sessionId: string) => Promise<SubmitResponse | null>;
}

export const createAnnotateClient = (serverUrl: string): AnnotateClient => {
  const base = serverUrl.replace(/\/$/, "");

  const postJson = async <T>(path: string, method: string, body: unknown): Promise<T | null> => {
    try {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        logRecoverableError(
          "annotate:client",
          new Error(`${method} ${path} -> ${response.status}`),
        );
        return null;
      }
      return (await response.json()) as T;
    } catch (error) {
      logRecoverableError("annotate:client", error);
      return null;
    }
  };

  return {
    save: (sessionId, annotation) =>
      postJson<SaveResponse>("/api/annotations", "POST", {
        sessionId,
        annotation: buildAnnotationPayload(annotation),
        imageBase64: annotation.screenshotDataUrl,
      }),
    update: async (sessionId, annotationId, comment, imageBase64) => {
      const result = await postJson<{ ok: boolean }>(
        `/api/annotations/${encodeURIComponent(annotationId)}`,
        "PUT",
        { sessionId, comment, imageBase64 },
      );
      return Boolean(result?.ok);
    },
    remove: async (sessionId, annotationId) => {
      const result = await postJson<{ ok: boolean }>(
        `/api/annotations/${encodeURIComponent(annotationId)}?sessionId=${encodeURIComponent(sessionId)}`,
        "DELETE",
        undefined,
      );
      return Boolean(result?.ok);
    },
    submit: (sessionId) =>
      postJson<SubmitResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/submit`, "POST", {}),
  };
};

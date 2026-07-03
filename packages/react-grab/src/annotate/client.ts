import { logRecoverableError } from "../utils/log-recoverable-error.js";
import type { AnnotationRecord } from "./types.js";

interface SyncResponse {
  ok: boolean;
  markdownPath: string;
  sessionDir: string;
  count: number;
}

export interface SessionImage {
  file: string;
  base64: string;
}

export interface AnnotateClient {
  /**
   * Sync the full annotation snapshot for a session (client is the source of
   * truth). Pass `image` when a newly-created annotation has a screenshot.
   */
  sync: (
    sessionId: string,
    annotations: AnnotationRecord[],
    image?: SessionImage | null,
  ) => Promise<SyncResponse | null>;
  /** Discard the whole session directory (Cancel). */
  remove: (sessionId: string) => Promise<boolean>;
}

export const createAnnotateClient = (serverUrl: string): AnnotateClient => {
  const base = serverUrl.replace(/\/$/, "");

  const request = async <T>(path: string, method: string, body?: unknown): Promise<T | null> => {
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
    sync: (sessionId, annotations, image) =>
      request<SyncResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`, "PUT", {
        annotations,
        image: image ?? null,
      }),
    remove: async (sessionId) => {
      const result = await request<{ ok: boolean }>(
        `/api/sessions/${encodeURIComponent(sessionId)}`,
        "DELETE",
      );
      return Boolean(result?.ok);
    },
  };
};

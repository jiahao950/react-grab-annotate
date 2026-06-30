import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderManifestMarkdown } from "./markdown.js";
import type { AnnotationInput, ServerConfig, SessionManifest, StoredAnnotation } from "./types.js";

const MANIFEST_FILE = "manifest.json";
const MARKDOWN_FILE = "annotations.md";
const DATA_URL_PREFIX = /^data:[^;]+;base64,/;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const sanitizeSegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 64) || "session";

const decodeImage = (imageBase64: string): Buffer => {
  const payload = imageBase64.replace(DATA_URL_PREFIX, "");
  return Buffer.from(payload, "base64");
};

export const getSessionDir = (config: ServerConfig, sessionId: string): string =>
  resolve(config.rootDir, config.baseDir, sanitizeSegment(sessionId));

const getManifestPath = (sessionDir: string): string => join(sessionDir, MANIFEST_FILE);

const readManifest = async (sessionDir: string, sessionId: string): Promise<SessionManifest> => {
  try {
    const raw = await readFile(getManifestPath(sessionDir), "utf8");
    const parsed: SessionManifest = JSON.parse(raw);
    return parsed;
  } catch {
    return { sessionId, createdAt: Date.now(), updatedAt: Date.now(), annotations: [] };
  }
};

const flushManifest = async (sessionDir: string, manifest: SessionManifest): Promise<void> => {
  manifest.updatedAt = Date.now();
  await writeFile(getManifestPath(sessionDir), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(join(sessionDir, MARKDOWN_FILE), renderManifestMarkdown(manifest), "utf8");
};

const screenshotFileName = (annotation: AnnotationInput): string =>
  `image-${annotation.number}-${sanitizeSegment(annotation.id)}.png`;

export interface SaveResult {
  annotation: StoredAnnotation;
  sessionDir: string;
  markdownPath: string;
}

export const saveAnnotation = async (
  config: ServerConfig,
  sessionId: string,
  input: AnnotationInput,
  imageBase64: string | null | undefined,
): Promise<SaveResult> => {
  const sessionDir = getSessionDir(config, sessionId);
  await mkdir(sessionDir, { recursive: true });
  const manifest = await readManifest(sessionDir, sessionId);

  let screenshotFile: string | null = null;
  if (imageBase64) {
    screenshotFile = screenshotFileName(input);
    await writeFile(join(sessionDir, screenshotFile), decodeImage(imageBase64));
  }

  const now = Date.now();
  const stored: StoredAnnotation = {
    ...input,
    screenshotFile,
    createdAt: now,
    updatedAt: now,
  };

  const existingIndex = manifest.annotations.findIndex((entry) => entry.id === input.id);
  if (existingIndex === -1) {
    manifest.annotations.push(stored);
  } else {
    manifest.annotations[existingIndex] = stored;
  }

  await flushManifest(sessionDir, manifest);
  return { annotation: stored, sessionDir, markdownPath: join(sessionDir, MARKDOWN_FILE) };
};

export const updateAnnotation = async (
  config: ServerConfig,
  sessionId: string,
  annotationId: string,
  comment: string | undefined,
  imageBase64: string | null | undefined,
): Promise<StoredAnnotation | null> => {
  const sessionDir = getSessionDir(config, sessionId);
  const manifest = await readManifest(sessionDir, sessionId);
  const target = manifest.annotations.find((entry) => entry.id === annotationId);
  if (!target) return null;

  if (typeof comment === "string") target.comment = comment;
  if (imageBase64) {
    const screenshotFile = target.screenshotFile ?? screenshotFileName(target);
    await writeFile(join(sessionDir, screenshotFile), decodeImage(imageBase64));
    target.screenshotFile = screenshotFile;
  }
  target.updatedAt = Date.now();

  await flushManifest(sessionDir, manifest);
  return target;
};

export const deleteAnnotation = async (
  config: ServerConfig,
  sessionId: string,
  annotationId: string,
): Promise<boolean> => {
  const sessionDir = getSessionDir(config, sessionId);
  const manifest = await readManifest(sessionDir, sessionId);
  const target = manifest.annotations.find((entry) => entry.id === annotationId);
  if (!target) return false;

  manifest.annotations = manifest.annotations.filter((entry) => entry.id !== annotationId);
  if (target.screenshotFile) {
    await rm(join(sessionDir, target.screenshotFile), { force: true });
  }
  await flushManifest(sessionDir, manifest);
  return true;
};

export interface SubmitResult {
  sessionDir: string;
  markdownPath: string;
  count: number;
}

export const submitSession = async (
  config: ServerConfig,
  sessionId: string,
): Promise<SubmitResult> => {
  const sessionDir = getSessionDir(config, sessionId);
  const manifest = await readManifest(sessionDir, sessionId);
  await flushManifest(sessionDir, manifest);
  return {
    sessionDir,
    markdownPath: join(sessionDir, MARKDOWN_FILE),
    count: manifest.annotations.length,
  };
};

// Deletes session directories created more than `maxAgeMs` ago. Uses the
// manifest's createdAt, falling back to the directory mtime. Returns the number
// of sessions removed.
export const cleanupStaleSessions = async (
  config: ServerConfig,
  maxAgeMs: number = SESSION_MAX_AGE_MS,
): Promise<number> => {
  const baseDir = resolve(config.rootDir, config.baseDir);
  let entries;
  try {
    entries = await readdir(baseDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  const now = Date.now();
  let removedCount = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionDir = join(baseDir, entry.name);

    let createdAt: number | null = null;
    try {
      const manifest: SessionManifest = JSON.parse(
        await readFile(join(sessionDir, MANIFEST_FILE), "utf8"),
      );
      createdAt = manifest.createdAt;
    } catch {
      try {
        createdAt = (await stat(sessionDir)).mtimeMs;
      } catch {
        continue;
      }
    }

    if (createdAt !== null && now - createdAt > maxAgeMs) {
      await rm(sessionDir, { recursive: true, force: true });
      removedCount += 1;
    }
  }
  return removedCount;
};

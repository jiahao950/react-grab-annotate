import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { renderAnnotationsMarkdown } from "./markdown.js";
import type {
  AnnotationRecord,
  RootManifest,
  RootSessionEntry,
  ServerConfig,
  SessionImage,
  SyncResult,
} from "./types.js";

const MANIFEST_FILE = "manifest.json";
const MARKDOWN_FILE = "annotations.md";
const DATA_URL_PREFIX = /^data:[^;]+;base64,/;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const sanitizeSegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 40) || "session";

const decodeImage = (imageBase64: string): Buffer =>
  Buffer.from(imageBase64.replace(DATA_URL_PREFIX, ""), "base64");

const baseDirPath = (config: ServerConfig): string => resolve(config.rootDir, config.baseDir);
const rootManifestPath = (config: ServerConfig): string => join(baseDirPath(config), MANIFEST_FILE);

// Replace the home-dir prefix with `~` so the copied prompt path stays short.
const shortenHome = (absolutePath: string): string => {
  const home = homedir();
  if (absolutePath === home) return "~";
  if (absolutePath.startsWith(`${home}/`)) return `~${absolutePath.slice(home.length)}`;
  return absolutePath;
};

const readRootManifest = async (config: ServerConfig): Promise<RootManifest> => {
  try {
    const parsed: RootManifest = JSON.parse(await readFile(rootManifestPath(config), "utf8"));
    if (Array.isArray(parsed.sessions)) return parsed;
  } catch {
    // no manifest yet
  }
  return { sessions: [] };
};

const writeRootManifest = async (config: ServerConfig, manifest: RootManifest): Promise<void> => {
  await writeFile(rootManifestPath(config), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
};

export const syncSession = async (
  config: ServerConfig,
  sessionId: string,
  annotations: AnnotationRecord[],
  image?: SessionImage | null,
): Promise<SyncResult> => {
  const folder = sanitizeSegment(sessionId);
  const sessionDir = join(baseDirPath(config), folder);
  await mkdir(sessionDir, { recursive: true });

  if (image?.file && image.base64) {
    await writeFile(join(sessionDir, sanitizeSegment(image.file)), decodeImage(image.base64));
  }
  await writeFile(join(sessionDir, MARKDOWN_FILE), renderAnnotationsMarkdown(annotations), "utf8");

  const manifest = await readRootManifest(config);
  if (!manifest.sessions.some((entry) => entry.path === folder)) {
    manifest.sessions.push({ path: folder, createdAt: Date.now() });
    await writeRootManifest(config, manifest);
  }

  return {
    sessionDir,
    markdownPath: shortenHome(join(sessionDir, MARKDOWN_FILE)),
    count: annotations.length,
  };
};

export const deleteSession = async (config: ServerConfig, sessionId: string): Promise<boolean> => {
  const folder = sanitizeSegment(sessionId);
  await rm(join(baseDirPath(config), folder), { recursive: true, force: true });

  const manifest = await readRootManifest(config);
  const remaining = manifest.sessions.filter((entry) => entry.path !== folder);
  if (remaining.length !== manifest.sessions.length) {
    await writeRootManifest(config, { sessions: remaining });
  }
  return true;
};

// Removes session folders older than `maxAgeMs`, driven by the root manifest's
// createdAt (falling back to directory mtime for folders not in the manifest).
export const cleanupStaleSessions = async (
  config: ServerConfig,
  maxAgeMs: number = SESSION_MAX_AGE_MS,
): Promise<number> => {
  const base = baseDirPath(config);
  let dirEntries;
  try {
    dirEntries = await readdir(base, { withFileTypes: true });
  } catch {
    return 0; // base dir does not exist yet — nothing to clean, don't create it
  }

  const now = Date.now();
  const manifest = await readRootManifest(config);
  const indexed = new Map(manifest.sessions.map((entry) => [entry.path, entry.createdAt]));
  const kept: RootSessionEntry[] = [];
  let removedCount = 0;

  for (const dirEntry of dirEntries) {
    if (!dirEntry.isDirectory()) continue;
    const folder = dirEntry.name;
    let createdAt = indexed.get(folder);
    if (createdAt === undefined) {
      try {
        createdAt = (await stat(join(base, folder))).mtimeMs;
      } catch {
        continue;
      }
    }
    if (now - createdAt > maxAgeMs) {
      await rm(join(base, folder), { recursive: true, force: true });
      removedCount += 1;
    } else {
      kept.push({ path: folder, createdAt });
    }
  }

  await writeRootManifest(config, { sessions: kept });
  return removedCount;
};

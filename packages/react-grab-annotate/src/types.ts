export interface ComponentChainEntry {
  name: string;
  filePath: string | null;
  lineNumber: number | null;
  exact?: boolean;
}

export interface AnnotationRecord {
  number: number;
  comment: string;
  filePath: string;
  lineNumber: number | null;
  componentName: string | null;
  componentChain?: ComponentChainEntry[];
  coveredComponents?: ComponentChainEntry[];
  tagName: string | null;
  selector: string;
  url: string;
  screenshotFile: string | null;
}

export interface SessionImage {
  file: string;
  base64: string;
}

export interface SyncSessionRequest {
  annotations: AnnotationRecord[];
  image?: SessionImage | null;
}

/** Root cleanup index (baseDir/manifest.json): just folder + creation time. */
export interface RootSessionEntry {
  path: string;
  createdAt: number;
}

export interface RootManifest {
  sessions: RootSessionEntry[];
}

export interface ServerConfig {
  port: number;
  host: string;
  rootDir: string;
  baseDir: string;
}

export interface SyncResult {
  sessionDir: string;
  /** Home-shortened (`~/…`) path to annotations.md, for the copied prompt. */
  markdownPath: string;
  count: number;
}

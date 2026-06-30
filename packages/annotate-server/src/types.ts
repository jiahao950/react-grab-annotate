export interface AnnotationBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationInput {
  id: string;
  number: number;
  comment: string;
  filePath: string;
  lineNumber: number | null;
  columnNumber?: number | null;
  componentName: string | null;
  tagName: string | null;
  selector: string;
  stackContext: string;
  bounds: AnnotationBounds;
  url: string;
}

export interface StoredAnnotation extends AnnotationInput {
  screenshotFile: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SessionManifest {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  annotations: StoredAnnotation[];
}

export interface SaveAnnotationRequest {
  sessionId: string;
  annotation: AnnotationInput;
  imageBase64?: string | null;
}

export interface UpdateAnnotationRequest {
  sessionId: string;
  comment?: string;
  imageBase64?: string | null;
}

export interface ServerConfig {
  port: number;
  host: string;
  rootDir: string;
  baseDir: string;
}

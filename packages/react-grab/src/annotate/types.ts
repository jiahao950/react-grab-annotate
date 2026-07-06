export type AnnotateAnchorMode = "click" | "drag";

export interface AnnotateAnchor {
  element: Element;
  mode: AnnotateAnchorMode;
  relativeX: number;
  relativeY: number;
}

export interface ComponentChainEntry {
  name: string;
  filePath: string | null;
  lineNumber: number | null;
}

export interface Annotation {
  id: string;
  number: number;
  comment: string;
  filePath: string;
  lineNumber: number | null;
  componentName: string | null;
  componentChain: ComponentChainEntry[];
  tagName: string | null;
  selector: string;
  url: string;
  anchor: AnnotateAnchor;
  screenshotFile: string | null;
  screenshotDataUrl: string | null;
}

/** Sent to the server to render annotations.md (no client-only fields). */
export interface AnnotationRecord {
  number: number;
  comment: string;
  filePath: string;
  lineNumber: number | null;
  componentName: string | null;
  componentChain: ComponentChainEntry[];
  tagName: string | null;
  selector: string;
  url: string;
  screenshotFile: string | null;
}

export interface AnnotateRegion {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
}

export interface AnchorPoint {
  x: number;
  y: number;
  mode: AnnotateAnchorMode;
}

export interface CommentSubmitInput {
  element: Element;
  elements: Element[];
  comment: string;
  region?: AnnotateRegion | null;
  anchorPoint?: AnchorPoint | null;
}

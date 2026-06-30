export interface AnnotateRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AnnotateAnchorMode = "click" | "drag";

export interface AnnotateAnchor {
  element: Element;
  mode: AnnotateAnchorMode;
  relativeX: number;
  relativeY: number;
}

export interface Annotation {
  id: string;
  number: number;
  comment: string;
  filePath: string;
  lineNumber: number | null;
  componentName: string | null;
  tagName: string | null;
  selector: string;
  stackContext: string;
  bounds: AnnotateRect;
  url: string;
  anchor: AnnotateAnchor;
  screenshotFile: string | null;
  screenshotDataUrl: string | null;
}

export interface PendingAnnotationDraft {
  anchor: AnnotateAnchor;
  bounds: AnnotateRect;
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

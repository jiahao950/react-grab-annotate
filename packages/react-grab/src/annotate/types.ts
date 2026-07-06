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
  exact: boolean;
}

export interface Annotation {
  id: string;
  number: number;
  comment: string;
  filePath: string;
  lineNumber: number | null;
  componentName: string | null;
  componentChain: ComponentChainEntry[];
  /**
   * For a box/region selection spanning several DISTINCT components, the set of
   * components it covers (innermost feature component of each, deduped). Empty
   * for a single-element selection or a box that only covers one component.
   */
  coveredComponents: ComponentChainEntry[];
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
  coveredComponents: ComponentChainEntry[];
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

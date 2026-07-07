export type AnnotateAnchorMode = "click" | "drag";

export interface AnnotateAnchor {
  element: Element;
  mode: AnnotateAnchorMode;
  relativeX: number;
  relativeY: number;
  /**
   * Viewport position at creation time. The mark is a fixed overlay pinned
   * here — it does NOT recompute from `element`, so it never vanishes when the
   * anchored node unmounts (virtualized lists recycle their DOM on scroll) or
   * scrolls out of view. The overlay is an independent layer, unaffected by the
   * host page's scrolling.
   */
  x: number;
  y: number;
}

/** A highlight box in viewport (client) coordinates, captured at creation. */
export interface AnnotateHighlight {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComponentChainEntry {
  name: string;
  filePath: string | null;
  lineNumber: number | null;
  exact: boolean;
  /**
   * DOM selector for this specific element. Only set for covered-elements
   * entries (box selection), where sibling elements often share a component and
   * source line — the selector is what tells them apart.
   */
  selector?: string;
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
  /**
   * Selection highlight box(es) in viewport coords, captured at creation. Drawn
   * as a fixed overlay layer (never recomputed from the element) so it persists
   * through scroll/virtualization, and reused as the screenshot highlight.
   */
  highlights: AnnotateHighlight[];
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

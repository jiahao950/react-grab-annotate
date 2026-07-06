import type { DragRect, Rect } from "../types.js";
import { suspendPointerEventsFreeze, resumePointerEventsFreeze } from "./pointer-events-freeze.js";
import {
  DRAG_SELECTION_COVERAGE_THRESHOLD,
  DRAG_SELECTION_SAMPLE_SPACING_PX,
  DRAG_SELECTION_MIN_SAMPLES_PER_AXIS,
  DRAG_SELECTION_MAX_SAMPLES_PER_AXIS,
  DRAG_SELECTION_MAX_TOTAL_SAMPLE_POINTS,
  DRAG_SELECTION_EDGE_INSET_PX,
} from "../constants.js";
import { isRootElement } from "./is-root-element.js";
import { clampToRange } from "./clamp-to-range.js";

const calculateIntersectionArea = (rect1: Rect, rect2: Rect): number => {
  const intersectionLeft = Math.max(rect1.left, rect2.left);
  const intersectionTop = Math.max(rect1.top, rect2.top);
  const intersectionRight = Math.min(rect1.right, rect2.right);
  const intersectionBottom = Math.min(rect1.bottom, rect2.bottom);

  const intersectionWidth = Math.max(0, intersectionRight - intersectionLeft);
  const intersectionHeight = Math.max(0, intersectionBottom - intersectionTop);

  return intersectionWidth * intersectionHeight;
};

const hasIntersection = (rect1: Rect, rect2: Rect): boolean => {
  return (
    rect1.left < rect2.right &&
    rect1.right > rect2.left &&
    rect1.top < rect2.bottom &&
    rect1.bottom > rect2.top
  );
};

const sortByDocumentOrder = (elements: Element[]): Element[] => {
  return elements.sort((leftElement, rightElement) => {
    if (leftElement === rightElement) return 0;
    const position = leftElement.compareDocumentPosition(rightElement);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
};

// Our own overlay/shadow-host elements. elementsFromPoint returns them too, and
// we must skip them when deciding which real page element is topmost at a point.
const isOverlayElement = (element: Element): boolean => {
  if (element.hasAttribute("data-react-grab")) return true;
  const rootNode = element.getRootNode();
  return rootNode instanceof ShadowRoot && rootNode.host.hasAttribute("data-react-grab");
};

interface SamplePoint {
  x: number;
  y: number;
}

const createSamplePoints = (dragRect: DragRect): SamplePoint[] => {
  if (dragRect.width <= 0 || dragRect.height <= 0) return [];

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const left = dragRect.x;
  const top = dragRect.y;
  const right = dragRect.x + dragRect.width;
  const bottom = dragRect.y + dragRect.height;

  const centerX = left + dragRect.width / 2;
  const centerY = top + dragRect.height / 2;

  const xCount = clampToRange(
    Math.ceil(dragRect.width / DRAG_SELECTION_SAMPLE_SPACING_PX),
    DRAG_SELECTION_MIN_SAMPLES_PER_AXIS,
    DRAG_SELECTION_MAX_SAMPLES_PER_AXIS,
  );
  const yCount = clampToRange(
    Math.ceil(dragRect.height / DRAG_SELECTION_SAMPLE_SPACING_PX),
    DRAG_SELECTION_MIN_SAMPLES_PER_AXIS,
    DRAG_SELECTION_MAX_SAMPLES_PER_AXIS,
  );
  const totalGridPoints = xCount * yCount;
  const scale =
    totalGridPoints > DRAG_SELECTION_MAX_TOTAL_SAMPLE_POINTS
      ? Math.sqrt(DRAG_SELECTION_MAX_TOTAL_SAMPLE_POINTS / totalGridPoints)
      : 1;
  const scaledXCount = clampToRange(
    Math.floor(xCount * scale),
    DRAG_SELECTION_MIN_SAMPLES_PER_AXIS,
    DRAG_SELECTION_MAX_SAMPLES_PER_AXIS,
  );
  const scaledYCount = clampToRange(
    Math.floor(yCount * scale),
    DRAG_SELECTION_MIN_SAMPLES_PER_AXIS,
    DRAG_SELECTION_MAX_SAMPLES_PER_AXIS,
  );

  const pointKeys = new Set<string>();
  const points: SamplePoint[] = [];

  const addPoint = (x: number, y: number) => {
    const clampedX = clampToRange(Math.round(x), 0, viewportWidth - 1);
    const clampedY = clampToRange(Math.round(y), 0, viewportHeight - 1);
    const key = `${clampedX}:${clampedY}`;
    if (pointKeys.has(key)) return;
    pointKeys.add(key);
    points.push({ x: clampedX, y: clampedY });
  };

  addPoint(left + DRAG_SELECTION_EDGE_INSET_PX, top + DRAG_SELECTION_EDGE_INSET_PX);
  addPoint(right - DRAG_SELECTION_EDGE_INSET_PX, top + DRAG_SELECTION_EDGE_INSET_PX);
  addPoint(left + DRAG_SELECTION_EDGE_INSET_PX, bottom - DRAG_SELECTION_EDGE_INSET_PX);
  addPoint(right - DRAG_SELECTION_EDGE_INSET_PX, bottom - DRAG_SELECTION_EDGE_INSET_PX);
  addPoint(centerX, top + DRAG_SELECTION_EDGE_INSET_PX);
  addPoint(centerX, bottom - DRAG_SELECTION_EDGE_INSET_PX);
  addPoint(left + DRAG_SELECTION_EDGE_INSET_PX, centerY);
  addPoint(right - DRAG_SELECTION_EDGE_INSET_PX, centerY);
  addPoint(centerX, centerY);

  for (let xIndex = 0; xIndex < scaledXCount; xIndex += 1) {
    const sampleX = left + ((xIndex + 0.5) / scaledXCount) * dragRect.width;
    for (let yIndex = 0; yIndex < scaledYCount; yIndex += 1) {
      const sampleY = top + ((yIndex + 0.5) / scaledYCount) * dragRect.height;
      addPoint(sampleX, sampleY);
    }
  }

  return points;
};

const filterElementsInDrag = (
  dragRect: DragRect,
  isValidGrabbableElement: (element: Element) => boolean,
  shouldCheckCoverage: boolean,
): Element[] => {
  const dragBounds: Rect = {
    left: dragRect.x,
    top: dragRect.y,
    right: dragRect.x + dragRect.width,
    bottom: dragRect.y + dragRect.height,
  };

  const candidates = new Set<Element>();
  const samplePoints = createSamplePoints(dragRect);

  suspendPointerEventsFreeze();
  try {
    for (const point of samplePoints) {
      const elementsAtPoint = document.elementsFromPoint(point.x, point.y);
      // Only the topmost real element at this point (and its ancestors, which
      // contain it) is actually visible here. Anything deeper in the stack that
      // is NOT an ancestor of the top element is painted behind it — e.g. page
      // content occluded by a modal/dialog. Including it would let a box drawn
      // inside a modal "select through" to the background. Skip our own overlay
      // when finding the top element.
      let topElement: Element | null = null;
      for (const element of elementsAtPoint) {
        if (isOverlayElement(element)) continue;
        topElement = element;
        break;
      }
      if (!topElement) continue;
      for (const candidateElement of elementsAtPoint) {
        if (candidateElement === topElement || candidateElement.contains(topElement)) {
          candidates.add(candidateElement);
        }
      }
    }
  } finally {
    resumePointerEventsFreeze();
  }

  const validCandidates: Element[] = [];
  for (const candidateElement of candidates) {
    if (!shouldCheckCoverage && isRootElement(candidateElement)) continue;
    if (!isValidGrabbableElement(candidateElement)) continue;
    validCandidates.push(candidateElement);
  }

  const candidateRects = new Map<Element, DOMRect>();
  for (const candidateElement of validCandidates) {
    candidateRects.set(candidateElement, candidateElement.getBoundingClientRect());
  }

  const matchingElements: Element[] = [];

  for (const candidateElement of validCandidates) {
    const elementRect = candidateRects.get(candidateElement)!;
    if (elementRect.width <= 0 || elementRect.height <= 0) continue;

    const elementBounds: Rect = {
      left: elementRect.left,
      top: elementRect.top,
      right: elementRect.left + elementRect.width,
      bottom: elementRect.top + elementRect.height,
    };

    if (shouldCheckCoverage) {
      const intersectionArea = calculateIntersectionArea(dragBounds, elementBounds);
      const elementArea = elementRect.width * elementRect.height;
      const hasMajorityCoverage =
        elementArea > 0 && intersectionArea / elementArea >= DRAG_SELECTION_COVERAGE_THRESHOLD;

      if (hasMajorityCoverage) {
        matchingElements.push(candidateElement);
      }
    } else if (hasIntersection(elementBounds, dragBounds)) {
      matchingElements.push(candidateElement);
    }
  }

  return sortByDocumentOrder(matchingElements);
};

const removeNestedElements = (elements: Element[]): Element[] => {
  // Drop any element that has an ancestor also in the set. Walking each
  // element's parent chain against a membership Set is O(n·depth) — the
  // previous elements.some(contains) form was O(n²) over the candidate set,
  // which spikes on dense drags (large-drag-selection covers it).
  const elementSet = new Set(elements);
  return elements.filter((element) => {
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (elementSet.has(ancestor)) return false;
    }
    return true;
  });
};

// When a drag collapses to a single covered container, the user was almost
// always boxing the SIBLINGS inside it (e.g. a row of chips) rather than the
// container itself. Descend through single-covered-child wrappers and return
// the shallowest level that has more than one covered child — that sibling
// group is what the box was drawn around. Stops at the first branch, so a chip
// with an icon + label doesn't get split into its parts.
const expandToSiblingGroup = (container: Element, coveredElements: Set<Element>): Element[] => {
  let current = container;
  for (;;) {
    const coveredChildren = Array.from(current.children).filter((child) =>
      coveredElements.has(child),
    );
    if (coveredChildren.length === 0) return [current];
    if (coveredChildren.length === 1) {
      current = coveredChildren[0];
      continue;
    }
    return coveredChildren;
  }
};

export const getElementsInDrag = (
  dragRect: DragRect,
  isValidGrabbableElement: (element: Element) => boolean,
  shouldCheckCoverage = true,
): Element[] => {
  const elements = filterElementsInDrag(dragRect, isValidGrabbableElement, shouldCheckCoverage);
  const outermost = removeNestedElements(elements);
  // A single outermost element means everything the box covered shares one
  // container; expand it to the sibling group the user actually framed. Any
  // other count is already a set of distinct siblings — leave it untouched.
  if (outermost.length !== 1) return outermost;
  return expandToSiblingGroup(outermost[0], new Set(elements));
};

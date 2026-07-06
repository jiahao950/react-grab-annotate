import { getOwnerStack, getSource, type StackFrame } from "bippy/source";
import {
  getFiberFromHostInstance,
  isInstrumentationActive,
  getDisplayName,
  isCompositeFiber,
  traverseFiber,
  type Fiber,
} from "bippy";
import { MAX_TRACE_CONTEXT_LINES } from "../constants.js";
import { resolveMaxContextLines } from "../utils/resolve-max-context-lines.js";
import { normalizeFilePath } from "../utils/normalize-file-path.js";
import {
  classifySourcePath,
  type SourcePathClassification,
} from "../utils/classify-source-path.js";
import { createElementSelector } from "../utils/create-element-selector.js";
import { isSharedUiSourcePath } from "../utils/is-shared-ui-source-path.js";
import { isNextProjectRuntime } from "../utils/is-next-project-runtime.js";
import { enrichServerFrameLocations, symbolicateServerFrames } from "./next-server-frames.js";
import { runQueuedSourceFetch } from "../utils/source-fetch-queue.js";
import { getHTMLPreview, getInlineHTMLPreview } from "./html-preview.js";
import {
  isInternalComponentName,
  isUsefulComponentName,
} from "../utils/is-useful-component-name.js";
import type { SourceLocation } from "../types.js";

const isSourceComponentName = (name: string): boolean => {
  if (name.length <= 1) return false;
  if (isInternalComponentName(name)) return false;
  if (name[0] !== name[0].toUpperCase()) return false;
  if (name.endsWith("Provider") || name.endsWith("Context")) return false;
  return true;
};

const toSourceComponentName = (name: string | null | undefined): string | null =>
  name && isSourceComponentName(name) ? name : null;

// Transparent wrapper components skipped during resolution. A wrapper that
// clones its child during its own render (floating-ui Tooltip/Popover, most
// HOCs) becomes the element's React owner, so resolution would stop at it
// instead of reaching the component that authored the element. Skipping these
// lets both the label and the source location fall through to the real target.
// @see AnnotateOptions.ignoreComponents
const DEFAULT_IGNORED_COMPONENT_NAMES = [
  // floating-ui / radix-style overlay wrappers
  "Tooltip",
  "Popover",
  "Popper",
  "Dropdown",
  "HoverCard",
  "ContextMenu",
  "Portal",
  "Slot",
  "Trigger",
  "PopoverChild",
  "PopoverShell",
  // framer-motion / motion (AnimatePresence internals clone their child too)
  "PopChild",
  "PopChildMeasure",
  "AnimatePresence",
  "LazyMotion",
  "MotionConfig",
  "Reorder",
  // low-signal text wrappers that add an overflow-tooltip around their content
  // (they wrap children in <Tooltip>, so they'd otherwise become the target)
  "OverflowTooltip",
  "OverflowText",
  "EllipsisText",
  // shared base UI primitives that wrap/clone their children (via a Tooltip or
  // an asChild/Slot clone). React attributes the child to them, but they are
  // never the code you'd want to edit — the feature component that uses them is.
  "IconButton",
  "Select",
  "Tabs",
  "DropdownMenu",
  "DropdownMenuItem",
  "InfiniteScroll",
];
// Empty until a host opts in (annotate mode calls setIgnoredComponentNames), so
// the base react-grab copy flow keeps its existing resolution behavior.
let ignoredComponentNames = new Set<string>();

export const setIgnoredComponentNames = (names: readonly string[] = []): void => {
  ignoredComponentNames = new Set<string>([...DEFAULT_IGNORED_COMPONENT_NAMES, ...names]);
};

const isIgnoredComponentName = (name: string | null | undefined): boolean =>
  Boolean(name) && ignoredComponentNames.has(name as string);

// True when `element` is the root DOM node a component instance renders — i.e.
// its fiber's parent is a component (not another host element). Used by box
// selection to pick out the distinct component instances a drag covers (e.g. a
// list of OptionItem rows), which is robust even when those rows sit under
// different wrapper divs and so aren't DOM siblings. Transparent fibers
// (Fragment, Provider) between the element and its component are skipped, but a
// host-element parent means the element is nested inside another element's
// output, so it is not a component root.
export const isComponentRootElement = (element: Element): boolean => {
  const fiber = getFiberFromHostInstance(element);
  if (!fiber) return false;
  let parent = fiber.return;
  while (parent && typeof parent.type !== "string" && !isCompositeFiber(parent)) {
    parent = parent.return;
  }
  return Boolean(parent) && typeof parent!.type !== "string" && isCompositeFiber(parent!);
};

// A composite fiber's display name, but only if it's a real, non-wrapper
// component name worth attributing an element to.
const usefulNonWrapperName = (fiber: Fiber | null | undefined): string | null => {
  if (!fiber || !isCompositeFiber(fiber)) return null;
  const displayName = getDisplayName(fiber.type);
  if (!displayName || !isUsefulComponentName(displayName)) return null;
  if (isIgnoredComponentName(displayName)) return null;
  return displayName;
};

const findNearestFiberElement = (element: Element): Element => {
  if (!isInstrumentationActive()) return element;
  let current: Element | null = element;
  while (current) {
    if (getFiberFromHostInstance(current)) return current;
    current = current.parentElement;
  }
  return element;
};

// Elements rendered through `.map()` share one JSX source location, so the
// source line alone can't tell list instances apart. React assigns a `key` only
// to siblings in a list, so we surface the nearest keyed fiber above the picked
// node. The walk crosses at most one component boundary: enough to reach a key
// on the list item's host element, on the list-item component itself, or on a
// host wrapper around a list-item component, without wandering up to unrelated
// ancestor keys (e.g. a route or transition `key` many components above).
const getNearestListItemKey = (element: Element): string | null => {
  if (!isInstrumentationActive()) return null;
  let fiber: Fiber | null = getFiberFromHostInstance(findNearestFiberElement(element));
  let componentBoundariesCrossed = 0;
  while (fiber) {
    if (fiber.key) return fiber.key;
    if (isCompositeFiber(fiber)) {
      componentBoundariesCrossed += 1;
      if (componentBoundariesCrossed === 2) break;
    }
    fiber = fiber.return;
  }
  return null;
};

const stackCache = new WeakMap<Element, Promise<StackFrame[] | null>>();
const fiberSourceCache = new WeakMap<Element, Promise<ResolvedSource | null>>();

// Bundle/source-map fetches that bippy makes on react-grab's behalf. Routing
// them through our own fetch lets us mark them high priority (so they jump the
// app's in-flight data fetches when a connection frees) and cancel them via the
// queue's abort signal when the source-fetch timeout fires.
const createSourceFetch =
  (signal: AbortSignal) =>
  (url: string): Promise<Response> =>
    fetch(url, { signal, priority: "high" });

// getOwnerStack fetches the element's bundle and source map, and on Next.js the
// symbolication POST adds another request. Both go through the source-fetch
// queue so a hover storm (drag-select) or a multi-element copy never fans out
// more concurrent requests than the connection pool can serve.
const fetchStackForElement = (element: Element): Promise<StackFrame[] | null> =>
  runQueuedSourceFetch(async (signal) => {
    try {
      const fiber = getFiberFromHostInstance(element);
      if (!fiber) return null;

      const frames = await getOwnerStack(fiber, true, createSourceFetch(signal));

      if (isNextProjectRuntime()) {
        const enrichedFrames = enrichServerFrameLocations(fiber, frames);
        return await symbolicateServerFrames(enrichedFrames, signal);
      }

      return frames;
    } catch {
      return null;
    }
  }, null);

export const getStack = (element: Element): Promise<StackFrame[] | null> => {
  if (!isInstrumentationActive()) return Promise.resolve([]);

  const nearestFiberElement = findNearestFiberElement(element);
  const cachedStackPromise = stackCache.get(nearestFiberElement);
  if (cachedStackPromise) return cachedStackPromise;

  // Evict failed or timed-out resolutions (null) so a later grab can retry once
  // the page's own fetches free a connection, while still deduping concurrent
  // in-flight lookups. A resolved empty array is a real "no frames" answer and
  // stays cached. Mirrors getCachedFiberSource.
  const stackPromise = fetchStackForElement(nearestFiberElement).then((stack) => {
    if (stack === null) stackCache.delete(nearestFiberElement);
    return stack;
  });
  stackCache.set(nearestFiberElement, stackPromise);
  return stackPromise;
};

export const getNearestComponentName = async (element: Element): Promise<string | null> => {
  if (!isInstrumentationActive()) return null;

  // Delegate to the same resolver the saved annotation uses, so the label and
  // the persisted source agree — it prefers an app-origin, non-wrapper component
  // (skipping Tooltip/HOC frames and package-origin animation wrappers like
  // framer-motion's PopChild). Falls back to the first named stack frame.
  const source = await resolveSource(element);
  if (source?.componentName) return source.componentName;

  const stack = await getStack(element);
  if (!stack) return null;
  let firstNamed: string | null = null;
  for (const frame of stack) {
    const componentName = toSourceComponentName(frame.functionName);
    if (!componentName) continue;
    if (firstNamed === null) firstNamed = componentName;
    if (!isIgnoredComponentName(componentName)) return componentName;
  }
  return firstNamed;
};

export interface ResolvedSource extends SourceLocation {
  origin: SourcePathClassification["origin"];
}

const pickSourceFrame = (frames: StackFrame[]): StackFrame | null => {
  // Prefer a real (non-wrapper) named frame, so a Tooltip/HOC frame at the top
  // of the owner stack doesn't win over the component that authored the element.
  const realFrame = frames.find((frame) => {
    const name = toSourceComponentName(frame.functionName);
    return name !== null && !isIgnoredComponentName(name);
  });
  if (realFrame) return realFrame;
  const namedFrame = frames.find((frame) => Boolean(toSourceComponentName(frame.functionName)));
  return namedFrame ?? frames[0] ?? null;
};

const getSourceComponentName = (fiber: Fiber | undefined): string | null => {
  if (!fiber || !isCompositeFiber(fiber)) return null;
  return toSourceComponentName(getDisplayName(fiber.type));
};

// The component that AUTHORED the element's JSX (`_debugOwner`), as opposed to
// the component it renders UNDER (`fiber.return`). These differ when a wrapper
// clones its child during its own render — floating-ui's Tooltip/Popover, and
// most HOCs. In the fiber (return) tree the element sits under the wrapper, so a
// return-walk resolves to `Tooltip`; but React records the real author on
// `_debugOwner` (cloneElement preserves it), so an owner-walk resolves to the
// component the user actually means (e.g. `NavBarTabItem`). This is the correct
// target for both the label and the saved source location.
const walkOwnerChain = (start: Fiber | null | undefined): Fiber | null => {
  const seen = new Set<Fiber>();
  let owner = (start as { _debugOwner?: Fiber } | null | undefined)?._debugOwner;
  while (owner && !seen.has(owner)) {
    seen.add(owner);
    if (usefulNonWrapperName(owner)) return owner;
    owner = (owner as { _debugOwner?: Fiber })._debugOwner;
  }
  return null;
};

const getOwnerFiber = (fiber: Fiber | null | undefined): Fiber | null => {
  // `_debugOwner` may be recorded on only one of the two fiber alternates
  // (current vs work-in-progress); getFiberFromHostInstance can hand back either
  // depending on timing, so consult both.
  return walkOwnerChain(fiber) ?? walkOwnerChain((fiber as { alternate?: Fiber } | null)?.alternate);
};

// getSource reads React's own dev-only debug data, so it works without bippy
// instrumentation, but it fetches the element's bundle/source map to map the
// location, so it runs through the source-fetch queue alongside getOwnerStack:
// both compete for the same connection pool and neither has its own timeout.
const getFiberSource = (element: Element): Promise<ResolvedSource | null> =>
  runQueuedSourceFetch(async (signal) => {
    const hostFiber = getFiberFromHostInstance(findNearestFiberElement(element));
    if (!hostFiber) return null;

    // Resolve the source of the component that AUTHORED the element (its
    // `_debugOwner`, skipping wrappers) rather than the host fiber. getSource is
    // source-mapped to the real .tsx, so this yields the right component's file
    // AND a real path — e.g. GeneralView.tsx, not the SimpleBar it renders in,
    // and not an unsymbolicated bundle chunk. The name comes from the same owner
    // so the label and the source always agree.
    const ownerFiber = getOwnerFiber(hostFiber);
    const targetFiber = ownerFiber ?? hostFiber;

    try {
      const source = await getSource(targetFiber, true, createSourceFetch(signal));
      if (!source?.fileName) return null;

      return {
        filePath: normalizeFilePath(source.fileName),
        lineNumber: source.lineNumber ?? null,
        columnNumber: source.columnNumber ?? null,
        componentName:
          getSourceComponentName(ownerFiber ?? undefined) ??
          toSourceComponentName(source.functionName) ??
          getSourceComponentName(hostFiber._debugOwner),
        origin: classifySourcePath(source.fileName).origin,
      };
    } catch {
      return null;
    }
  }, null);

const getCachedFiberSource = (element: Element): Promise<ResolvedSource | null> => {
  const nearestFiberElement = findNearestFiberElement(element);
  const cachedFiberSourcePromise = fiberSourceCache.get(nearestFiberElement);
  if (cachedFiberSourcePromise) return cachedFiberSourcePromise;

  // Evict null resolutions so a later grab can retry once the fiber's source
  // metadata is attached, while still deduping concurrent in-flight lookups.
  const fiberSourcePromise = getFiberSource(nearestFiberElement).then((source) => {
    if (!source) fiberSourceCache.delete(nearestFiberElement);
    return source;
  });
  fiberSourceCache.set(nearestFiberElement, fiberSourcePromise);
  return fiberSourcePromise;
};

const ORIGIN_PREFERENCE_ORDER = ["app", "package"] as const;

export const selectResolvedSource = (
  fiberSource: ResolvedSource | null,
  stack: StackFrame[],
): ResolvedSource | null => {
  for (const origin of ORIGIN_PREFERENCE_ORDER) {
    if (fiberSource?.origin === origin) return fiberSource;
    const framesOfOrigin = stack.filter(
      (frame) => classifySourcePath(frame.fileName).origin === origin,
    );
    const preferredFrame = pickSourceFrame(framesOfOrigin);
    if (preferredFrame?.fileName) {
      return {
        filePath: normalizeFilePath(preferredFrame.fileName),
        lineNumber: preferredFrame.lineNumber ?? null,
        columnNumber: preferredFrame.columnNumber ?? null,
        componentName: toSourceComponentName(preferredFrame.functionName),
        origin,
      };
    }
  }
  return null;
};

export interface ComponentChainEntry {
  name: string;
  filePath: string | null;
  lineNumber: number | null;
  exact: boolean;
}

// The chain of feature components that authored the element, INNERMOST first
// (LanguageSelector › GeneralView › OptionsDialogContent › …). Single-component
// resolution is inherently ambiguous — React doesn't say which owner is "the"
// feature component — so we hand the AI the chain and let it pick. Base-UI
// wrappers (Popover/Tooltip/OptionItem/framer-motion, per the ignore set) are
// filtered OUT, so the innermost remaining entry is the specific component the
// user selected (e.g. LanguageSelector), and the rest are its containers.
export const resolveComponentChain = async (element: Element): Promise<ComponentChainEntry[]> => {
  if (!isInstrumentationActive()) return [];
  const hostFiber = getFiberFromHostInstance(findNearestFiberElement(element));
  if (!hostFiber) return [];

  const directOwner =
    (hostFiber as { _debugOwner?: Fiber })._debugOwner ??
    (hostFiber as { alternate?: { _debugOwner?: Fiber } }).alternate?._debugOwner;

  const ownerFibers: Fiber[] = [];
  const seenFibers = new Set<Fiber>();
  let owner = directOwner;
  while (owner && ownerFibers.length < 6 && !seenFibers.has(owner)) {
    seenFibers.add(owner);
    if (usefulNonWrapperName(owner)) {
      ownerFibers.push(owner);
    }
    owner = (owner as { _debugOwner?: Fiber })._debugOwner;
  }
  if (ownerFibers.length === 0) return [];

  // When the innermost feature component authored the element DIRECTLY (no base
  // wrapper in between), resolve the element's own source so the line points at
  // the actual JSX (e.g. the <h1> at ChatHomeViewWelcome.tsx:34) rather than the
  // component's declaration line. Otherwise the component's own source is best.
  const firstOwnerIsDirect = directOwner !== undefined && ownerFibers[0] === directOwner;

  return runQueuedSourceFetch(async (signal) => {
    const entries: ComponentChainEntry[] = [];
    const seenNames = new Set<string>();
    for (let index = 0; index < ownerFibers.length; index += 1) {
      const fiber = ownerFibers[index];
      const name = getSourceComponentName(fiber);
      if (!name || seenNames.has(name)) continue;
      // Only the innermost entry, when the element is authored directly, gets
      // the element's own line. Everything else is a component-level location.
      const usesElementSource = index === 0 && firstOwnerIsDirect;
      const sourceFiber = usesElementSource ? hostFiber : fiber;
      let filePath: string | null = null;
      let lineNumber: number | null = null;
      try {
        const source = await getSource(sourceFiber, true, createSourceFetch(signal));
        if (source?.fileName) {
          filePath = normalizeFilePath(source.fileName);
          lineNumber = source.lineNumber ?? null;
        }
      } catch {
        // keep the name even if the location couldn't be resolved
      }
      seenNames.add(name);
      entries.push({ name, filePath, lineNumber, exact: usesElementSource });
    }
    return entries;
  }, []);
};

export const resolveSource = async (element: Element): Promise<ResolvedSource | null> => {
  // getFiberSource already resolves from the element's authoring component
  // (_debugOwner, skipping wrappers) and is source-mapped to the real .tsx, so
  // an app-origin hit is the answer. Only fall back to the owner stack when the
  // fiber source is missing or not app code.
  const fiberSource = await getCachedFiberSource(element);
  if (fiberSource?.origin === "app") return fiberSource;

  return selectResolvedSource(fiberSource, (await getStack(element)) ?? []);
};

export const getComponentDisplayName = (element: Element): string | null => {
  const fiberElement = findNearestFiberElement(element);
  // Prefer the JSX author (skips clone-wrapper components like Tooltip); fall
  // back to the render-nesting walk when no owner is recorded (production, or
  // host nodes with no owner metadata).
  const ownerFiber = getOwnerFiber(getFiberFromHostInstance(fiberElement));
  const ownerName = ownerFiber ? getDisplayName(ownerFiber.type) : null;
  if (ownerName && isUsefulComponentName(ownerName)) return ownerName;
  return getComponentNamesFromFiber(fiberElement, 1)[0] ?? null;
};

export interface StackContextOptions {
  maxLines?: number;
}

interface TraceContextResult {
  text: string;
  shouldAppendSelectorHint: boolean;
}

const getComponentNamesFromFiber = (element: Element, maxCount: number): string[] => {
  if (!isInstrumentationActive()) return [];
  const fiber = getFiberFromHostInstance(element);
  if (!fiber) return [];

  const componentNames: string[] = [];
  traverseFiber(
    fiber,
    (currentFiber) => {
      if (componentNames.length >= maxCount) return true;
      const displayName = usefulNonWrapperName(currentFiber);
      if (displayName) {
        componentNames.push(displayName);
      }
      return false;
    },
    true,
  );
  return componentNames;
};

// Next.js apps render from absolute paths; trimming them to a project-relative
// "/./…" form keeps displayed locations short and consistent with its stacks.
const NEXT_PROJECT_SOURCE_PATH_MARKERS = ["/src/app/", "/src/pages/", "/app/", "/pages/"];

const formatContextFilePath = (filePath: string, isNextProject: boolean): string => {
  const normalizedPath = normalizeFilePath(filePath);
  if (!isNextProject || !normalizedPath.startsWith("/")) return normalizedPath;

  for (const marker of NEXT_PROJECT_SOURCE_PATH_MARKERS) {
    const markerIndex = normalizedPath.indexOf(marker);
    if (markerIndex !== -1) return `/./${normalizedPath.slice(markerIndex + 1)}`;
  }

  return normalizedPath;
};

const formatSourceContextLine = (source: SourceLocation, isNextProject: boolean): string => {
  const displayPath = formatContextFilePath(source.filePath, isNextProject);
  // HACK: bundlers like Vite produce unreliable line/column numbers from owner
  // stacks, so we only include them for Next.js where the dev server
  // symbolicates frames via source maps.
  const location =
    isNextProject && source.lineNumber
      ? `${displayPath}:${source.lineNumber}${source.columnNumber ? `:${source.columnNumber}` : ""}`
      : displayPath;
  return source.componentName
    ? `\n  in ${source.componentName} (at ${location})`
    : `\n  in ${location}`;
};

interface StackFrameLine {
  text: string;
  // A real app-owned source file: suppresses the CSS selector-hint fallback.
  isAppSource: boolean;
  // High-signal app source that spends the line budget. Shared-UI frames are
  // app source but free, like package frames.
  consumesBudget: boolean;
}

const LOW_SIGNAL_FRAME: Pick<StackFrameLine, "isAppSource" | "consumesBudget"> = {
  isAppSource: false,
  consumesBudget: false,
};

const formatStackFrameLine = (
  frame: StackFrame,
  sourceClassification: SourcePathClassification,
  componentName: string | null,
  isNextProject: boolean,
): StackFrameLine | null => {
  const libraryPackage = sourceClassification.packageName;
  // Only app-owned frames contribute a file path; library frames render by
  // component name (e.g. "in Tabs (@radix-ui/react-tabs)") so node_modules
  // paths never compete with the resolved app source.
  const appSourceFilePath = sourceClassification.origin === "app" ? frame.fileName : null;

  if (frame.isServer && !appSourceFilePath && (componentName || !frame.functionName)) {
    const serverTag = libraryPackage ? `${libraryPackage} at Server` : "at Server";
    return {
      text: `\n  in ${componentName ?? "<anonymous>"} (${serverTag})`,
      ...LOW_SIGNAL_FRAME,
    };
  }

  if (!appSourceFilePath && componentName) {
    return {
      text: libraryPackage
        ? `\n  in ${componentName} (${libraryPackage})`
        : `\n  in ${componentName}`,
      ...LOW_SIGNAL_FRAME,
    };
  }

  if (libraryPackage) {
    return { text: `\n  in ${libraryPackage}`, ...LOW_SIGNAL_FRAME };
  }

  if (appSourceFilePath) {
    return {
      text: formatSourceContextLine(
        {
          componentName,
          filePath: appSourceFilePath,
          lineNumber: frame.lineNumber ?? null,
          columnNumber: frame.columnNumber ?? null,
        },
        isNextProject,
      ),
      isAppSource: true,
      consumesBudget: !isSharedUiSourcePath(appSourceFilePath),
    };
  }

  return null;
};

export const formatStackContext = (
  stack: StackFrame[],
  options: StackContextOptions = {},
  leadingSource: ResolvedSource | null = null,
): TraceContextResult => {
  const maxLines = resolveMaxContextLines(options.maxLines);
  // max, not min: the extended cap must sit above the soft budget. A
  // caller-raised maxContextLines is allowed to lift the hard cap past
  // MAX_TRACE_CONTEXT_LINES on purpose (opting into a deeper trace); min would
  // collapse the cap onto maxLines and disable the free low-signal extension.
  const hardMaxLines = Math.max(maxLines, MAX_TRACE_CONTEXT_LINES);
  const isNextProject = isNextProjectRuntime();
  const lines: string[] = [];
  let previousLibraryFrameKey: string | null = null;
  let didDedupeLeadingComponent = false;
  let hasTrustedSource = false;
  let budgetedLineCount = 0;

  if (leadingSource) {
    hasTrustedSource = leadingSource.origin === "app";
    // A shared-UI leading source means the user grabbed a primitive directly;
    // keep its budget free so the feature ancestors that consume it surface.
    if (!isSharedUiSourcePath(leadingSource.filePath)) budgetedLineCount += 1;
    lines.push(formatSourceContextLine(leadingSource, isNextProject));
  }

  for (const frame of stack) {
    // maxLines is the budget for high-signal app-source frames. Low-signal
    // lines (library frames and shared-UI/design-system app frames) are free:
    // they never consume the soft budget, only the hard cap, so wrapper noise
    // never crowds out the meaningful app source locations. maxLines of 0 is
    // therefore the minimal trace: only the leading source line, if any.
    if (budgetedLineCount >= maxLines || lines.length >= hardMaxLines) break;

    const sourceClassification = classifySourcePath(frame.fileName);

    const componentName = toSourceComponentName(frame.functionName);
    const libraryFrameKey = sourceClassification.packageName
      ? `${sourceClassification.packageName}:${componentName ?? ""}:${frame.isServer ? "server" : "client"}`
      : null;
    if (libraryFrameKey && libraryFrameKey === previousLibraryFrameKey) continue;

    // The owner stack's top frame is usually the same component the leading
    // source line already names. Drop only that single duplicate; deeper frames
    // sharing the name (e.g. recursive components) are kept.
    if (
      !didDedupeLeadingComponent &&
      componentName &&
      componentName === leadingSource?.componentName
    ) {
      didDedupeLeadingComponent = true;
      continue;
    }

    const frameLine = formatStackFrameLine(
      frame,
      sourceClassification,
      componentName,
      isNextProject,
    );
    if (frameLine === null) continue;

    // Shared-UI frames are now surfaced for free, so a single primitives file
    // (e.g. several sidebar parts, or a recursive component) can emit the same
    // line repeatedly - especially under bundlers where we omit line numbers and
    // identical-looking frames collapse to the same text. Skip consecutive
    // duplicates so the trace stays readable.
    if (frameLine.text === lines[lines.length - 1]) continue;

    if (frameLine.isAppSource) hasTrustedSource = true;
    if (frameLine.consumesBudget) budgetedLineCount += 1;
    lines.push(frameLine.text);
    previousLibraryFrameKey = libraryFrameKey;
  }

  return {
    text: lines.join(""),
    shouldAppendSelectorHint: !hasTrustedSource,
  };
};

// Package sources are never promoted to the leading line: surfacing
// node_modules paths is what this avoids.
const resolveLeadingSource = async (element: Element): Promise<ResolvedSource | null> => {
  const fiberSource = await getCachedFiberSource(element);
  return fiberSource?.origin === "app" ? fiberSource : null;
};

const getTraceContext = async (
  element: Element,
  options: StackContextOptions = {},
): Promise<TraceContextResult> => {
  const leadingSource = await resolveLeadingSource(element);
  const stack = await getStack(element);

  const stackContext = formatStackContext(stack ?? [], options, leadingSource);
  if (stackContext.text) return stackContext;

  const componentNames = getComponentNamesFromFiber(
    findNearestFiberElement(element),
    resolveMaxContextLines(options.maxLines),
  );
  if (componentNames.length > 0) {
    return {
      text: componentNames.map((componentName) => `\n  in ${componentName}`).join(""),
      shouldAppendSelectorHint: true,
    };
  }

  return { text: "", shouldAppendSelectorHint: true };
};

export const getStackContext = async (
  element: Element,
  options: StackContextOptions = {},
): Promise<string> => {
  const traceContext = await getTraceContext(element, options);
  return traceContext.text;
};

const composeElementContext = (element: Element, traceContext: TraceContextResult): string => {
  const listItemKey = getNearestListItemKey(element);
  const keyHint = listItemKey !== null ? `\n  key: "${listItemKey}"` : "";
  const selectorHint = traceContext.shouldAppendSelectorHint
    ? `\n  selector: ${createElementSelector(element)}`
    : "";
  return `${traceContext.text}${keyHint}${selectorHint}`;
};

export const getElementReferenceContext = async (
  element: Element,
  options: StackContextOptions = {},
): Promise<string> => {
  const traceContext = await getTraceContext(element, options);
  return `${getInlineHTMLPreview(element)}${composeElementContext(element, traceContext).replace(/\n\s+/g, " ")}`;
};

export const formatElementInfo = async (
  element: Element,
  options: StackContextOptions = {},
): Promise<string> => {
  const nearestFiberElement = findNearestFiberElement(element);
  const htmlPreview = getHTMLPreview(nearestFiberElement);
  const traceContext = await getTraceContext(nearestFiberElement, options);
  return `${htmlPreview}${composeElementContext(nearestFiberElement, traceContext)}`;
};

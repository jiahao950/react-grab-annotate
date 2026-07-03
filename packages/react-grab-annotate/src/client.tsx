import { useEffect } from "react";

const DEFAULT_SERVER_URL = "http://localhost:5179";

export interface ReactGrabAnnotateOptions {
  /**
   * URL of the local annotate server (the `react-grab-annotate` bin).
   * @default "http://localhost:5179"
   */
  serverUrl?: string;
}

export interface AnnotateHandle {
  dispose: () => void;
}

/**
 * Imperative entry for non-React hosts. Nothing loads or touches globals until
 * this is called — react-grab is imported lazily here, never at module load.
 */
export const startAnnotate = (options: ReactGrabAnnotateOptions = {}): AnnotateHandle => {
  let disposed = false;
  let api: { dispose?: () => void } | undefined;

  void import("react-grab/core").then(({ init }) => {
    if (disposed) return;
    api = init({ annotate: { serverUrl: options.serverUrl ?? DEFAULT_SERVER_URL } });
  });

  return {
    dispose: () => {
      disposed = true;
      api?.dispose?.();
      api = undefined;
    },
  };
};

export interface ReactGrabAnnotateProps extends ReactGrabAnnotateOptions {
  /**
   * Escape hatch to turn the tool off without unmounting. Prefer gating by not
   * rendering the component at all (e.g. only in development).
   * @default true
   */
  enabled?: boolean;
}

/**
 * Drop-in component that starts annotation mode on mount. Importing this module
 * has no side effects; react-grab is only loaded once the component mounts
 * (client-side, after render), so it is SSR-safe and never pollutes globals
 * until you actually render it.
 *
 * You decide when it runs — typically dev only:
 * ```tsx
 * {process.env.NODE_ENV === "development" && <ReactGrabAnnotate />}
 * ```
 */
export const ReactGrabAnnotate = (props: ReactGrabAnnotateProps): null => {
  const serverUrl = props.serverUrl;
  const enabled = props.enabled;

  useEffect(() => {
    if (enabled === false) return;
    const handle = startAnnotate({ serverUrl });
    return () => handle.dispose();
  }, [serverUrl, enabled]);

  return null;
};

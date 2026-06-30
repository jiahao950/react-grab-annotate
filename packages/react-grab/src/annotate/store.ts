import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import type { Annotation } from "./types.js";

export interface AnnotateStore {
  annotations: Annotation[];
  isActive: () => boolean;
  activeCardId: () => string | null;
  isSubmitting: () => boolean;
  toast: () => string | null;
  setActive: (value: boolean) => void;
  setActiveCard: (id: string | null) => void;
  setSubmitting: (value: boolean) => void;
  setToast: (value: string | null) => void;
  add: (annotation: Annotation) => void;
  patch: (id: string, changes: Partial<Annotation>) => void;
  remove: (id: string) => void;
  clear: () => void;
  count: () => number;
  nextNumber: () => number;
}

export const createAnnotateStore = (): AnnotateStore => {
  const [annotations, setAnnotations] = createStore<Annotation[]>([]);
  const [isActive, setActive] = createSignal(false);
  const [activeCardId, setActiveCard] = createSignal<string | null>(null);
  const [isSubmitting, setSubmitting] = createSignal(false);
  const [toast, setToast] = createSignal<string | null>(null);

  return {
    annotations,
    isActive,
    activeCardId,
    isSubmitting,
    toast,
    setActive,
    setActiveCard,
    setSubmitting,
    setToast,
    add: (annotation) => setAnnotations(produce((list) => list.push(annotation))),
    patch: (id, changes) =>
      setAnnotations(
        (entry) => entry.id === id,
        produce((entry) => Object.assign(entry, changes)),
      ),
    remove: (id) => setAnnotations((list) => list.filter((entry) => entry.id !== id)),
    clear: () => setAnnotations([]),
    count: () => annotations.length,
    nextNumber: () => annotations.reduce((max, entry) => Math.max(max, entry.number), 0) + 1,
  };
};

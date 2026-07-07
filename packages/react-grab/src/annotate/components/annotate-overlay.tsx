import { createMemo, For, Show, type Component } from "solid-js";
import type { AnnotateStore } from "../store.js";
import { AnnotateToolbar } from "./annotate-toolbar.js";
import { Mark } from "./mark.js";
import { MarkCard } from "./mark-card.js";

export interface AnnotateOverlayProps {
  store: AnnotateStore;
  onEnter: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  onSaveCard: (id: string, comment: string) => void;
  onDeleteCard: (id: string) => void;
}

export const AnnotateOverlay: Component<AnnotateOverlayProps> = (props) => {
  const activeAnnotation = createMemo(() =>
    props.store.annotations.find((entry) => entry.id === props.store.activeCardId()),
  );

  return (
    <>
      <For each={props.store.annotations}>
        {(annotation) => (
          <For each={annotation.highlights}>
            {(highlight) => (
              <div
                class="rga-highlight"
                data-react-grab-ignore-events="true"
                style={{
                  left: `${highlight.x}px`,
                  top: `${highlight.y}px`,
                  width: `${highlight.width}px`,
                  height: `${highlight.height}px`,
                }}
              />
            )}
          </For>
        )}
      </For>
      <For each={props.store.annotations}>
        {(annotation) => (
          <Mark
            annotation={annotation}
            isActive={props.store.activeCardId() === annotation.id}
            onActivate={() => props.store.setActiveCard(annotation.id)}
          />
        )}
      </For>
      <Show when={activeAnnotation()}>
        {(annotation) => (
          <MarkCard
            annotation={annotation()}
            onSave={(comment) => props.onSaveCard(annotation().id, comment)}
            onDelete={() => props.onDeleteCard(annotation().id)}
            onClose={() => props.store.setActiveCard(null)}
          />
        )}
      </Show>
      <AnnotateToolbar
        store={props.store}
        onEnter={props.onEnter}
        onCancel={props.onCancel}
        onSubmit={props.onSubmit}
      />
      <Show when={props.store.toast()}>
        {(message) => (
          <div class="rga-toast" data-react-grab-ignore-events="true">
            <span class="rga-toast-check">✓</span>
            {message()}
          </div>
        )}
      </Show>
    </>
  );
};

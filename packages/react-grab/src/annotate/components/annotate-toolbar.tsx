import { Show, type Component } from "solid-js";
import { isMac } from "../../utils/is-mac.js";
import type { AnnotateStore } from "../store.js";

interface AnnotateToolbarProps {
  store: AnnotateStore;
  onEnter: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}

const enterShortcut = (): string => (isMac() ? "⌘ ↵" : "Ctrl + Enter");
const submitShortcut = (): string => (isMac() ? "⌘ C" : "Ctrl + C");

export const AnnotateToolbar: Component<AnnotateToolbarProps> = (props) => {
  return (
    <div class="rga-dock" data-react-grab-ignore-events="true">
      <Show
        when={props.store.isActive()}
        fallback={
          <button
            type="button"
            class="rga-btn rga-btn-primary"
            data-rga-tooltip={`进入标注模式 · ${enterShortcut()}`}
            on:click={() => props.onEnter()}
          >
            标注
            <Show when={props.store.count() > 0}>
              <span class="rga-badge">{props.store.count()}</span>
            </Show>
          </button>
        }
      >
        <button
          type="button"
          class="rga-btn rga-btn-secondary"
          data-rga-tooltip="退出标注模式"
          disabled={props.store.isSubmitting()}
          on:click={() => props.onCancel()}
        >
          取消
        </button>
        <button
          type="button"
          class="rga-btn rga-btn-primary"
          data-rga-tooltip={`提交并复制提示语 · ${submitShortcut()}`}
          disabled={props.store.isSubmitting()}
          on:click={() => props.onSubmit()}
        >
          <Show when={props.store.isSubmitting()} fallback="Submit">
            <span class="rga-spinner" />
            保存中…
          </Show>
          <Show when={!props.store.isSubmitting() && props.store.count() > 0}>
            <span class="rga-badge">{props.store.count()}</span>
          </Show>
        </button>
      </Show>
    </div>
  );
};

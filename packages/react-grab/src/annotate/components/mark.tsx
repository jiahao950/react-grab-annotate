import { createMemo, Show, type Accessor, type Component } from "solid-js";
import { isElementConnected } from "../../utils/is-element-connected.js";
import { ANNOTATE_MARK_SIZE_PX } from "../constants.js";
import type { Annotation } from "../types.js";

interface MarkProps {
  annotation: Annotation;
  version: Accessor<number>;
  isActive: boolean;
  onActivate: () => void;
}

interface MarkPosition {
  x: number;
  y: number;
  visible: boolean;
}

export const Mark: Component<MarkProps> = (props) => {
  const position = createMemo<MarkPosition>(() => {
    props.version();
    const { element, relativeX, relativeY } = props.annotation.anchor;
    if (!isElementConnected(element)) return { x: 0, y: 0, visible: false };
    const rect = element.getBoundingClientRect();
    const x = rect.left + relativeX * rect.width;
    const y = rect.top + relativeY * rect.height;
    const visible = x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;
    return { x, y, visible };
  });

  return (
    <Show when={position().visible}>
      <button
        type="button"
        class="rga-mark"
        classList={{ "rga-mark-active": props.isActive }}
        style={{
          left: `${position().x}px`,
          top: `${position().y}px`,
          "--rga-mark-size": `${ANNOTATE_MARK_SIZE_PX}px`,
        }}
        data-react-grab-ignore-events="true"
        on:click={(event) => {
          event.stopPropagation();
          props.onActivate();
        }}
      >
        {props.annotation.number}
      </button>
    </Show>
  );
};

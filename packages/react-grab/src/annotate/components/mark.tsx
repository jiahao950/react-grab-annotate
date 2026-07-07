import { type Component } from "solid-js";
import { ANNOTATE_MARK_SIZE_PX } from "../constants.js";
import type { Annotation } from "../types.js";

interface MarkProps {
  annotation: Annotation;
  isActive: boolean;
  onActivate: () => void;
}

// The mark is a fixed overlay pin at the position captured when the annotation
// was created. It intentionally does NOT track the anchored element: doing so
// made it vanish the moment a virtualized list recycled that element's DOM node
// on scroll. As an independent layer, it stays put regardless of page scroll.
export const Mark: Component<MarkProps> = (props) => {
  return (
    <button
      type="button"
      class="rga-mark"
      classList={{ "rga-mark-active": props.isActive }}
      style={{
        left: `${props.annotation.anchor.x}px`,
        top: `${props.annotation.anchor.y}px`,
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
  );
};

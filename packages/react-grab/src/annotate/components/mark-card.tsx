import { createMemo, createSignal, Show, type Accessor, type Component } from "solid-js";
import { isElementConnected } from "../../utils/is-element-connected.js";
import {
  ANNOTATE_CARD_OFFSET_PX,
  ANNOTATE_CARD_VIEWPORT_MARGIN_PX,
  ANNOTATE_CARD_WIDTH_PX,
} from "../constants.js";
import type { Annotation } from "../types.js";

interface MarkCardProps {
  annotation: Annotation;
  version: Accessor<number>;
  onSave: (comment: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

const formatLocation = (annotation: Annotation): string => {
  if (!annotation.filePath) return annotation.tagName ?? "未知位置";
  if (annotation.lineNumber === null) return annotation.filePath;
  return `${annotation.filePath}:${annotation.lineNumber}`;
};

export const MarkCard: Component<MarkCardProps> = (props) => {
  const [comment, setComment] = createSignal(props.annotation.comment);
  const [cardHeight, setCardHeight] = createSignal(220);
  let cardRef: HTMLDivElement | undefined;

  const position = createMemo(() => {
    props.version();
    const { element, relativeX, relativeY } = props.annotation.anchor;
    const rect = isElementConnected(element)
      ? element.getBoundingClientRect()
      : new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
    const anchorX = rect.left + relativeX * rect.width;
    const anchorY = rect.top + relativeY * rect.height;

    const margin = ANNOTATE_CARD_VIEWPORT_MARGIN_PX;
    const maxLeft = window.innerWidth - ANNOTATE_CARD_WIDTH_PX - margin;
    const maxTop = window.innerHeight - cardHeight() - margin;
    const left = Math.min(
      Math.max(anchorX + ANNOTATE_CARD_OFFSET_PX, margin),
      Math.max(margin, maxLeft),
    );
    const top = Math.min(
      Math.max(anchorY + ANNOTATE_CARD_OFFSET_PX, margin),
      Math.max(margin, maxTop),
    );
    return { left, top };
  });

  const measure = (): void => {
    if (cardRef) setCardHeight(cardRef.offsetHeight);
  };

  return (
    <div
      ref={(element) => {
        cardRef = element;
        queueMicrotask(measure);
      }}
      class="rga-card"
      style={{
        left: `${position().left}px`,
        top: `${position().top}px`,
        "--rga-card-width": `${ANNOTATE_CARD_WIDTH_PX}px`,
      }}
      data-react-grab-ignore-events="true"
      on:click={(event) => event.stopPropagation()}
      on:keydown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          props.onClose();
        }
      }}
    >
      <div class="rga-card-header">
        <span class="rga-card-num">{props.annotation.number}</span>
        <span class="rga-card-loc" title={formatLocation(props.annotation)}>
          {formatLocation(props.annotation)}
        </span>
      </div>
      <Show when={props.annotation.screenshotDataUrl}>
        {(dataUrl) => <img class="rga-card-shot" src={dataUrl()} alt="annotation screenshot" />}
      </Show>
      <div class="rga-card-body">
        <textarea
          class="rga-textarea"
          data-react-grab-ignore-events="true"
          value={comment()}
          placeholder="描述要修改的内容…"
          autofocus
          on:input={(event) => setComment(event.currentTarget.value)}
        />
      </div>
      <div class="rga-card-footer">
        <button type="button" class="rga-fbtn rga-fbtn-danger" on:click={() => props.onDelete()}>
          删除
        </button>
        <span class="rga-spacer" />
        <button type="button" class="rga-fbtn" on:click={() => props.onClose()}>
          取消
        </button>
        <button
          type="button"
          class="rga-fbtn rga-fbtn-primary"
          on:click={() => props.onSave(comment())}
        >
          保存
        </button>
      </div>
    </div>
  );
};

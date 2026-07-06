import type { AnnotationRecord, ComponentChainEntry } from "./types.js";

const formatSourceLocation = (annotation: AnnotationRecord): string => {
  if (!annotation.filePath) return "(未知)";
  if (annotation.lineNumber === null) return annotation.filePath;
  return `${annotation.filePath}:${annotation.lineNumber}`;
};

const formatChainLocation = (entry: ComponentChainEntry): string => {
  if (!entry.filePath) return "(位置未知)";
  return entry.lineNumber === null ? entry.filePath : `${entry.filePath}:${entry.lineNumber}`;
};

const renderAnnotation = (annotation: AnnotationRecord): string => {
  // Outermost feature component first — usually the code to edit; inner entries
  // are the base/layout components it renders through. React can't say which one
  // is "the" component, so we list the whole chain and let the reader pick.
  const chain = [...(annotation.componentChain ?? [])].reverse();
  const heading =
    chain.length > 0
      ? chain.map((entry) => entry.name).join(" › ")
      : annotation.componentName || annotation.tagName || "元素";
  const lines: string[] = [];
  lines.push(`## #${annotation.number} — ${heading}`);
  lines.push("");
  if (chain.length > 0) {
    lines.push("- 组件链（从外到内，优先改最外层的业务组件）:");
    for (const entry of chain) {
      lines.push(`  - ${entry.name} — \`${formatChainLocation(entry)}\``);
    }
  } else {
    lines.push(`- 源码位置: \`${formatSourceLocation(annotation)}\``);
  }
  if (annotation.selector) {
    lines.push(`- 选择器: \`${annotation.selector}\``);
  }
  if (annotation.url) {
    lines.push(`- 页面: ${annotation.url}`);
  }
  if (annotation.screenshotFile) {
    lines.push(`- 截图: ![#${annotation.number}](./${annotation.screenshotFile})`);
  }
  lines.push("");
  lines.push("**评论:**");
  lines.push("");
  lines.push(annotation.comment.trim() || "(空)");
  return lines.join("\n");
};

export const renderAnnotationsMarkdown = (annotations: AnnotationRecord[]): string => {
  const sorted = [...annotations].sort((first, second) => first.number - second.number);
  const header = [
    "# 标注",
    "",
    `共 ${sorted.length} 条标注。每条包含源码位置、截图与评论，请据此修改项目代码。`,
    "",
  ];
  const body = sorted.map(renderAnnotation).join("\n\n");
  return `${header.join("\n")}\n${body}\n`;
};

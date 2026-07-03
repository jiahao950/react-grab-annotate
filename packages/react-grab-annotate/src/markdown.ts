import type { SessionManifest, StoredAnnotation } from "./types.js";

const formatSourceLocation = (annotation: StoredAnnotation): string => {
  if (!annotation.filePath) return "(未知)";
  if (annotation.lineNumber === null) return annotation.filePath;
  return `${annotation.filePath}:${annotation.lineNumber}`;
};

const renderAnnotation = (annotation: StoredAnnotation): string => {
  const heading = annotation.componentName || annotation.tagName || "元素";
  const lines: string[] = [];
  lines.push(`## #${annotation.number} — ${heading}`);
  lines.push("");
  lines.push(`- 源码位置: \`${formatSourceLocation(annotation)}\``);
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
  if (annotation.stackContext.trim()) {
    lines.push("");
    lines.push("<details><summary>组件栈</summary>");
    lines.push("");
    lines.push("```");
    lines.push(annotation.stackContext.trim());
    lines.push("```");
    lines.push("");
    lines.push("</details>");
  }
  return lines.join("\n");
};

export const renderManifestMarkdown = (manifest: SessionManifest): string => {
  const sorted = [...manifest.annotations].sort((first, second) => first.number - second.number);
  const header: string[] = [];
  header.push(`# 标注会话 \`${manifest.sessionId}\``);
  header.push("");
  header.push(
    `共 ${sorted.length} 条标注。下面每条都包含源码位置、截图与评论，请据此修改项目代码。`,
  );
  header.push("");
  const body = sorted.map(renderAnnotation).join("\n\n");
  return `${header.join("\n")}\n${body}\n`;
};

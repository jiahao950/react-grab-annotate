---
"react-grab": minor
---

Add annotation mode (`init({ annotate: true })`): a Figma-style source-annotation workflow built on react-grab's selection engine. A single "标注" entry button replaces the toolbar; activating it shows Cancel/Submit. Selecting an element and writing a comment captures a snapDOM screenshot + source location (filePath:line, component, stack) + selector and persists them to disk via the new `@react-grab/annotate-server`, dropping a numbered Mark that follows the element across nested-scroll containers. Marks open an editable card (view/edit/delete); Escape only closes the popup, Submit copies an AI prompt pointing at the saved markdown and clears the session. The annotation overlay is event-isolated from the page so it never selects itself and never leaks hover to content behind its controls.

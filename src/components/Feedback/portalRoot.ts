/**
 * Floating UI (tag pickers, reply menus) portals into a .feedback-page element
 * rather than bare <body>, so it inherits the scoped design tokens: the
 * full-screen overlay when it's open, otherwise a body-level container (the
 * History panel's own ancestors may be transformed, which breaks position:fixed).
 */
export function getFeedbackPortalRoot(): HTMLElement {
  const overlay = document.querySelector<HTMLElement>(".feedback-overlay");
  if (overlay) return overlay;
  let root = document.getElementById("feedback-portal-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "feedback-portal-root";
    root.className = "feedback-page feedback-portal-root";
    document.body.appendChild(root);
  }
  return root;
}

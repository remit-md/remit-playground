/**
 * Collapsible JSON viewer component.
 */

export function renderJsonViewer(data: unknown, collapsed = false): HTMLElement {
  const container = document.createElement("div");
  container.className = "mt-2";

  const toggle = document.createElement("button");
  toggle.className = "text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors";
  toggle.innerHTML = `<span class="chevron">${collapsed ? "▶" : "▼"}</span> <span>JSON</span>`;

  const body = document.createElement("pre");
  body.className = `json-body text-xs bg-gray-900 rounded p-2 overflow-auto max-h-48 text-green-300 mt-1 ${collapsed ? "" : "open"}`;
  body.textContent = JSON.stringify(data, null, 2);

  toggle.addEventListener("click", () => {
    body.classList.toggle("open");
    const chevron = toggle.querySelector(".chevron");
    if (chevron) chevron.textContent = body.classList.contains("open") ? "▼" : "▶";
  });

  container.appendChild(toggle);
  container.appendChild(body);
  return container;
}

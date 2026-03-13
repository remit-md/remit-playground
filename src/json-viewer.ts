/**
 * Collapsible JSON viewer component with syntax highlighting.
 */

/** Syntax-highlight a JSON string for light theme. */
function highlightJson(json: string): string {
  return json.replace(
    /("(?:\\.|[^"\\])*")\s*:/g,
    '<span style="color:#2ABFAB">$1</span>:',
  ).replace(
    /:\s*("(?:\\.|[^"\\])*")/g,
    (_: string, val: string) => `: <span style="color:#000">${val}</span>`,
  ).replace(
    /:\s*(\d+(?:\.\d+)?)/g,
    ': <span style="color:#0066CC">$1</span>',
  ).replace(
    /:\s*(true|false|null)/g,
    ': <span style="color:#D14">$1</span>',
  );
}

export function renderJsonViewer(data: unknown, collapsed = false): HTMLElement {
  const container = document.createElement("div");
  container.className = "mt-2";

  const toggle = document.createElement("button");
  toggle.className = "text-xs text-[#9B9B9B] hover:text-black flex items-center gap-1 transition-colors";
  toggle.innerHTML = `<span class="chevron">${collapsed ? "\u25B6" : "\u25BC"}</span> <span>JSON</span>`;

  const body = document.createElement("pre");
  body.className = `json-body text-xs bg-[#FAFAF7] rounded p-2 overflow-auto max-h-48 mt-1 ${collapsed ? "" : "open"}`;
  body.innerHTML = highlightJson(JSON.stringify(data, null, 2));

  toggle.addEventListener("click", () => {
    body.classList.toggle("open");
    const chevron = toggle.querySelector(".chevron");
    if (chevron) chevron.textContent = body.classList.contains("open") ? "\u25BC" : "\u25B6";
  });

  container.appendChild(toggle);
  container.appendChild(body);
  return container;
}

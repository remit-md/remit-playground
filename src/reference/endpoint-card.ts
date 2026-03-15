/**
 * Endpoint card component for the API Reference section.
 * Shows method badge, path, description, and an optional Try button
 * that fires a real request using playground wallets.
 */

import { renderJsonViewer } from "../json-viewer.js";
import { apiPost, apiGet, BASE_URL } from "../api.js";
import type { PlaygroundWallet } from "../wallet.js";
import type { EndpointDef, HttpMethod } from "./categories.js";

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "bg-[#2ABFAB] text-white",
  POST: "bg-[#2ABFAB] text-white",
  PATCH: "bg-orange-500 text-white",
  DELETE: "bg-red-600 text-white",
};

export function renderEndpointCard(
  ep: EndpointDef,
  agent: PlaygroundWallet,
  provider: PlaygroundWallet,
): HTMLElement {
  const card = document.createElement("div");
  card.className = "rounded-lg border border-[#D4D2CC] bg-white overflow-hidden";

  // ── Header row: method badge + path + description + try button
  const header = document.createElement("div");
  header.className = "flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#F5F0EB] transition-colors";

  const badge = document.createElement("span");
  badge.className = `text-xs font-bold px-2 py-0.5 rounded ${METHOD_COLORS[ep.method]}`;
  badge.textContent = ep.method;
  header.appendChild(badge);

  const pathEl = document.createElement("span");
  pathEl.className = "text-sm font-mono text-black";
  pathEl.textContent = ep.path;
  header.appendChild(pathEl);

  const desc = document.createElement("span");
  desc.className = "text-xs text-[#6B6B6B] ml-2 hidden sm:inline";
  desc.textContent = ep.description;
  header.appendChild(desc);

  const spacer = document.createElement("span");
  spacer.className = "flex-1";
  header.appendChild(spacer);

  // ── Try button
  if (ep.tryable) {
    const tryBtn = document.createElement("button");
    tryBtn.className = "shrink-0 px-3 py-1 rounded text-xs font-medium bg-[#F5F0EB] text-black hover:bg-[#2ABFAB] hover:text-white transition-colors";
    tryBtn.textContent = "Try";
    tryBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void fireRequest(ep, agent, provider, resultArea);
    });
    header.appendChild(tryBtn);
  }

  card.appendChild(header);

  // ── Expandable detail area (description on mobile + request body)
  const detail = document.createElement("div");
  detail.className = "hidden border-t border-[#E5E3DE]";

  const detailInner = document.createElement("div");
  detailInner.className = "px-4 py-3 space-y-2";

  // Description (always visible in detail)
  const detailDesc = document.createElement("div");
  detailDesc.className = "text-xs text-[#6B6B6B]";
  detailDesc.textContent = ep.description;
  detailInner.appendChild(detailDesc);

  // Sample request body (for POST/DELETE with buildRequest)
  if (ep.buildRequest) {
    const reqLabel = document.createElement("div");
    reqLabel.className = "text-xs text-[#6B6B6B] font-semibold mt-2";
    reqLabel.textContent = "Request body:";
    detailInner.appendChild(reqLabel);
    const sampleBody = ep.buildRequest(agent, provider);
    detailInner.appendChild(renderJsonViewer(sampleBody, false));
  }

  // Auth info
  const authLabel = document.createElement("div");
  authLabel.className = "text-xs text-[#8A8A8A] mt-2";
  if (ep.noAuth) {
    authLabel.textContent = "Auth: none (public)";
  } else {
    authLabel.textContent = `Auth: EIP-712 (${ep.authAs === "provider" ? "provider" : "agent"} wallet)`;
  }
  detailInner.appendChild(authLabel);

  detail.appendChild(detailInner);
  card.appendChild(detail);

  // ── Result area (shown after Try)
  const resultArea = document.createElement("div");
  resultArea.className = "hidden";
  card.appendChild(resultArea);

  // Toggle detail on header click
  header.addEventListener("click", () => {
    detail.classList.toggle("hidden");
  });

  return card;
}

// ── Fire a real API request ──────────────────────────────────────────────────

async function fireRequest(
  ep: EndpointDef,
  agent: PlaygroundWallet,
  provider: PlaygroundWallet,
  resultArea: HTMLElement,
): Promise<void> {
  resultArea.innerHTML = "";
  resultArea.className = "border-t border-[#E5E3DE] px-4 py-3";

  const spinner = document.createElement("div");
  spinner.className = "text-xs text-[#6B6B6B] pulse";
  spinner.textContent = "Requesting…";
  resultArea.appendChild(spinner);

  try {
    let data: unknown;
    const resolvedPath = ep.buildPath ? ep.buildPath(agent, provider) : ep.path;
    const authWallet = ep.authAs === "provider" ? provider : agent;

    // Determine base URL — /health is at server root, everything else under /api/v0
    const base = ep.publicRoot ? BASE_URL.replace("/api/v0", "") : BASE_URL;

    if (ep.noAuth) {
      // Public endpoint — raw fetch, no auth headers
      const fetchOpts: RequestInit = ep.method === "GET" ? {} : {
        method: ep.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ep.buildRequest ? ep.buildRequest(agent, provider) : {}),
      };
      const res = await fetch(`${base}${resolvedPath}`, fetchOpts);
      data = await res.json().catch(() => ({ status: res.status, ok: res.ok }));
    } else if (ep.method === "GET") {
      data = await apiGet<unknown>(resolvedPath, authWallet);
    } else {
      const body = ep.buildRequest ? ep.buildRequest(agent, provider) : {};
      data = await apiPost<unknown>(resolvedPath, body, authWallet);
    }

    resultArea.innerHTML = "";
    const statusBadge = document.createElement("span");
    statusBadge.className = "text-xs font-medium text-[#2ABFAB]";
    statusBadge.textContent = "Success";
    resultArea.appendChild(statusBadge);
    resultArea.appendChild(renderJsonViewer(data, false));
  } catch (err: unknown) {
    resultArea.innerHTML = "";
    const statusBadge = document.createElement("span");
    statusBadge.className = "text-xs font-medium text-red-400";
    statusBadge.textContent = "Error";
    resultArea.appendChild(statusBadge);

    const errData = err instanceof Error && "body" in err
      ? (err as { body: unknown }).body
      : { message: err instanceof Error ? err.message : String(err) };
    resultArea.appendChild(renderJsonViewer(errData, false));
  }
}

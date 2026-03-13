/**
 * API Reference page — scrollable, collapsible category cards
 * with live "Try" buttons that fire real requests using playground wallets.
 */

import { buildCategories } from "./categories.js";
import { renderEndpointCard } from "./endpoint-card.js";
import type { PlaygroundWallet } from "../wallet.js";

export function buildReferencePage(
  container: HTMLElement,
  agent: PlaygroundWallet,
  provider: PlaygroundWallet,
): void {
  container.innerHTML = "";
  container.className = "flex-1 overflow-y-auto";

  const inner = document.createElement("div");
  inner.className = "max-w-3xl mx-auto px-4 py-6 space-y-6";

  // Page header
  const pageHeader = document.createElement("div");
  pageHeader.className = "mb-4";

  const title = document.createElement("h1");
  title.className = "text-lg font-bold text-black";
  title.textContent = "API Reference";
  pageHeader.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "text-sm text-[#9B9B9B] mt-1";
  subtitle.textContent = "Every endpoint in the remit.md protocol. Click \"Try\" to fire live requests against Base Sepolia.";
  pageHeader.appendChild(subtitle);

  inner.appendChild(pageHeader);

  // Build categories
  const categories = buildCategories();

  for (const cat of categories) {
    const section = document.createElement("div");
    section.className = "rounded-xl border border-[#E5E3DE] bg-white overflow-hidden";

    // Category header (collapsible)
    const catHeader = document.createElement("div");
    catHeader.className = "flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-[#F5F0EB] transition-colors select-none";

    const chevron = document.createElement("span");
    chevron.className = "text-[#9B9B9B] text-xs transition-transform";
    chevron.textContent = "\u25BC";
    catHeader.appendChild(chevron);

    const catName = document.createElement("span");
    catName.className = "text-sm font-semibold text-black";
    catName.textContent = cat.name;
    catHeader.appendChild(catName);

    const countBadge = document.createElement("span");
    countBadge.className = "text-xs text-[#C0BFBA] ml-1";
    countBadge.textContent = `(${cat.endpoints.length})`;
    catHeader.appendChild(countBadge);

    section.appendChild(catHeader);

    // Endpoint list
    const endpointList = document.createElement("div");
    endpointList.className = "px-3 pb-3 space-y-2";

    for (const ep of cat.endpoints) {
      endpointList.appendChild(renderEndpointCard(ep, agent, provider));
    }

    section.appendChild(endpointList);

    // Toggle collapse
    catHeader.addEventListener("click", () => {
      const isHidden = endpointList.classList.contains("hidden");
      endpointList.classList.toggle("hidden");
      chevron.textContent = isHidden ? "\u25BC" : "\u25B6";
    });

    inner.appendChild(section);
  }

  container.appendChild(inner);
}

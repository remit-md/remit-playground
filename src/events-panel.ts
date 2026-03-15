/**
 * Webhook Events panel — collects webhook event payloads emitted by flows
 * and displays them in a scrolling feed, colour-coded by category.
 *
 * This is a passive collector — no network connections. Flow steps with
 * variant: "webhook" push their payloads here via pushEvent().
 */

import { renderJsonViewer } from "./json-viewer.js";

// ── Event category colour map ──────────────────────────────────────────────────

const CATEGORY_COLOURS: Record<string, string> = {
  payment:  "#2ABFAB",
  escrow:   "#0066CC",
  tab:      "#7C3AED",
  stream:   "#DB2777",
  bounty:   "#D97706",
  deposit:  "#059669",
  x402:     "#DC2626",
};

function categoryOf(event: string): string {
  return event.split(".")[0] ?? "unknown";
}

function colourOf(event: string): string {
  return CATEGORY_COLOURS[categoryOf(event)] ?? "#6B6B6B";
}

// ── EventsPanel class ─────────────────────────────────────────────────────────

export class EventsPanel {
  private readonly container: HTMLElement;
  private listEl!: HTMLElement;
  private countEl!: HTMLElement;
  private count = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.build();
  }

  private build(): void {
    this.container.innerHTML = "";
    this.container.classList.add("flex", "flex-col");

    // ── Compact header
    const header = document.createElement("div");
    header.className = "flex items-center justify-between px-3 py-1.5 bg-white border-b border-[#E5E3DE] shrink-0";

    const left = document.createElement("div");
    left.className = "flex items-center gap-2";

    const title = document.createElement("span");
    title.className = "text-xs font-semibold text-[#2ABFAB] uppercase tracking-wider";
    title.textContent = "Webhook Events";
    left.appendChild(title);

    this.countEl = document.createElement("span");
    this.countEl.className = "text-[10px] text-[#8A8A8A]";
    left.appendChild(this.countEl);

    header.appendChild(left);

    const clearBtn = document.createElement("button");
    clearBtn.className = "px-1.5 py-0.5 rounded text-[10px] text-[#6B6B6B] hover:text-black hover:bg-[#F5F0EB] transition-colors";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", () => this.clear());
    header.appendChild(clearBtn);

    this.container.appendChild(header);

    // ── Event list
    this.listEl = document.createElement("div");
    this.listEl.className = "flex-1 overflow-y-auto px-3 py-2 space-y-1.5";

    this.appendPlaceholder();
    this.container.appendChild(this.listEl);
  }

  /** Push a webhook event payload from a flow step. */
  pushEvent(event: Record<string, unknown>, recipient: "agent" | "provider"): void {
    this.removePlaceholder();
    this.count++;
    this.countEl.textContent = `(${this.count})`;

    const eventType = String(event["event"] ?? "unknown");
    const colour = colourOf(eventType);
    const ts = String(event["occurred_at"] ?? new Date().toISOString())
      .replace("T", " ")
      .slice(11, 19); // HH:MM:SS

    const card = document.createElement("div");
    card.className = "step-enter rounded border border-[#E5E3DE] bg-white px-2.5 py-1.5";

    const topRow = document.createElement("div");
    topRow.className = "flex items-center gap-1.5 mb-0.5";

    // Recipient badge: AGENT (teal) or PROVIDER (indigo)
    const recipientBadge = document.createElement("span");
    recipientBadge.className = "text-[9px] font-bold px-1.5 py-0.5 rounded text-white uppercase tracking-wide shrink-0";
    recipientBadge.style.backgroundColor = recipient === "agent" ? "#2ABFAB" : "#6366F1";
    recipientBadge.textContent = recipient === "agent" ? "AGENT" : "PROVIDER";
    topRow.appendChild(recipientBadge);

    const badge = document.createElement("span");
    badge.className = "text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white";
    badge.style.backgroundColor = colour;
    badge.textContent = eventType;
    topRow.appendChild(badge);

    const time = document.createElement("span");
    time.className = "text-[10px] text-[#8A8A8A] font-mono ml-auto";
    time.textContent = ts;
    topRow.appendChild(time);

    card.appendChild(topRow);
    card.appendChild(renderJsonViewer(event, true));

    // Prepend so newest events appear at the top
    this.listEl.insertBefore(card, this.listEl.firstChild);
  }

  private appendPlaceholder(): void {
    const placeholder = document.createElement("div");
    placeholder.id = "events-placeholder";
    placeholder.className = "text-[11px] text-[#8A8A8A] text-center py-4";
    placeholder.textContent = "Run a flow to see webhook events.";
    this.listEl.appendChild(placeholder);
  }

  private removePlaceholder(): void {
    document.getElementById("events-placeholder")?.remove();
  }

  clear(): void {
    this.listEl.innerHTML = "";
    this.count = 0;
    this.countEl.textContent = "";
    this.appendPlaceholder();
  }
}

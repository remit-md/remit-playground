/**
 * Live Events panel — connects to GET /api/v0/events/stream (SSE via fetch)
 * and renders incoming events in real time, grouped by category.
 *
 * EventSource does not support custom headers, so we use fetch + ReadableStream.
 */

import { renderJsonViewer } from "./json-viewer.js";
import { signRequest, type PlaygroundWallet } from "./wallet.js";
import { BASE_URL } from "./api.js";

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
  private statusDot!: HTMLElement;
  private statusText!: HTMLElement;
  private connectBtn!: HTMLButtonElement;
  private countEl!: HTMLElement;
  private wallet: PlaygroundWallet | null = null;
  private abort: AbortController | null = null;
  private count = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.build();
  }

  private build(): void {
    this.container.innerHTML = "";
    // Add layout classes without clobbering visibility classes set by parent
    this.container.classList.add("flex", "flex-col");

    // ── Header
    const header = document.createElement("div");
    header.className = "flex items-center justify-between px-4 py-2 bg-white border-b border-[#E5E3DE] shrink-0";

    const left = document.createElement("div");
    left.className = "flex items-center gap-3";

    const title = document.createElement("span");
    title.className = "text-xs font-semibold text-[#2ABFAB] uppercase tracking-wider";
    title.textContent = "Live Events";
    left.appendChild(title);

    this.statusDot = document.createElement("span");
    this.statusDot.className = "w-2 h-2 rounded-full bg-[#D4D2CC]";
    left.appendChild(this.statusDot);

    this.statusText = document.createElement("span");
    this.statusText.className = "text-xs text-[#6B6B6B]";
    this.statusText.textContent = "disconnected";
    left.appendChild(this.statusText);

    this.countEl = document.createElement("span");
    this.countEl.className = "text-xs text-[#8A8A8A]";
    left.appendChild(this.countEl);

    header.appendChild(left);

    const right = document.createElement("div");
    right.className = "flex items-center gap-2";

    const clearBtn = document.createElement("button");
    clearBtn.className = "px-2 py-1 rounded text-xs text-[#6B6B6B] hover:text-black hover:bg-[#F5F0EB] transition-colors";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", () => this.clear());
    right.appendChild(clearBtn);

    this.connectBtn = document.createElement("button");
    this.connectBtn.className = "px-3 py-1 rounded text-xs font-medium bg-[#2ABFAB] text-white hover:bg-[#24A896] transition-colors";
    this.connectBtn.textContent = "Connect";
    this.connectBtn.addEventListener("click", () => this.toggle());
    right.appendChild(this.connectBtn);

    header.appendChild(right);
    this.container.appendChild(header);

    // ── Description bar
    const desc = document.createElement("div");
    desc.className = "px-4 py-1.5 text-xs text-[#6B6B6B] bg-[#FAFAF7] border-b border-[#E5E3DE] shrink-0";
    desc.textContent = "SSE stream delivers the same payload as webhooks — no polling, no webhook URL needed. Run any flow to see its events appear here.";
    this.container.appendChild(desc);

    // ── Category legend
    const legend = document.createElement("div");
    legend.className = "flex items-center gap-2 px-4 py-1.5 bg-[#FAFAF7] border-b border-[#E5E3DE] shrink-0 overflow-x-auto";
    for (const [cat, colour] of Object.entries(CATEGORY_COLOURS)) {
      const chip = document.createElement("span");
      chip.className = "text-xs px-2 py-0.5 rounded-full text-white shrink-0";
      chip.style.backgroundColor = colour;
      chip.textContent = cat;
      legend.appendChild(chip);
    }
    this.container.appendChild(legend);

    // ── Event list
    this.listEl = document.createElement("div");
    this.listEl.className = "flex-1 overflow-y-auto p-4 space-y-2";

    this.appendPlaceholder();
    this.container.appendChild(this.listEl);
  }

  setWallet(wallet: PlaygroundWallet): void {
    this.wallet = wallet;
  }

  private setStatus(state: "connecting" | "connected" | "disconnected" | "error"): void {
    const colours: Record<string, string> = {
      connecting: "#D97706",
      connected: "#2ABFAB",
      disconnected: "#D4D2CC",
      error: "#DC2626",
    };
    const labels: Record<string, string> = {
      connecting: "connecting…",
      connected: "connected",
      disconnected: "disconnected",
      error: "error — click to retry",
    };
    this.statusDot.style.backgroundColor = colours[state] ?? "#D4D2CC";
    this.statusDot.className = `w-2 h-2 rounded-full${state === "connecting" ? " pulse" : ""}`;
    this.statusText.textContent = labels[state] ?? state;
    this.connectBtn.textContent =
      state === "connected" || state === "connecting" ? "Disconnect" : "Connect";
  }

  private toggle(): void {
    if (this.abort) {
      this.disconnect();
    } else {
      void this.connect();
    }
  }

  async connect(): Promise<void> {
    if (!this.wallet || this.abort) return;
    this.setStatus("connecting");
    this.abort = new AbortController();

    try {
      const authHeaders = await signRequest(this.wallet, "GET", "/api/v0/events/stream");
      const res = await fetch(`${BASE_URL}/events/stream`, {
        headers: authHeaders,
        signal: this.abort.signal,
      });

      if (!res.ok || !res.body) {
        this.setStatus("error");
        this.addSystemMessage(`Connection failed: HTTP ${res.status}`);
        this.abort = null;
        return;
      }

      this.setStatus("connected");
      this.removePlaceholder();
      this.addSystemMessage("SSE stream connected — events will appear as they arrive.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const json = JSON.parse(line.slice(6)) as Record<string, unknown>;
              if (json["event"] !== "keepalive") {
                this.addEvent(json);
              }
            } catch {
              // malformed line — skip
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // user-initiated disconnect — no error shown
      } else {
        this.setStatus("error");
        this.addSystemMessage(`Stream error: ${err instanceof Error ? err.message : String(err)}`);
        this.abort = null;
        return;
      }
    }

    if (this.statusText.textContent !== "error — click to retry") {
      this.setStatus("disconnected");
    }
    this.abort = null;
  }

  disconnect(): void {
    this.abort?.abort();
    this.abort = null;
    this.setStatus("disconnected");
  }

  private addEvent(event: Record<string, unknown>): void {
    this.count++;
    this.countEl.textContent = `(${this.count})`;

    const eventType = String(event["event"] ?? "unknown");
    const colour = colourOf(eventType);
    const ts = String(event["occurred_at"] ?? new Date().toISOString())
      .replace("T", " ")
      .slice(0, 19);

    const card = document.createElement("div");
    card.className = "step-enter rounded-lg border border-[#E5E3DE] bg-white p-3";

    const topRow = document.createElement("div");
    topRow.className = "flex items-center justify-between mb-1";

    const badge = document.createElement("span");
    badge.className = "text-xs font-semibold px-2 py-0.5 rounded-full text-white";
    badge.style.backgroundColor = colour;
    badge.textContent = eventType;
    topRow.appendChild(badge);

    const time = document.createElement("span");
    time.className = "text-xs text-[#8A8A8A] font-mono";
    time.textContent = ts;
    topRow.appendChild(time);

    card.appendChild(topRow);
    card.appendChild(renderJsonViewer(event, true));

    // Prepend so newest events appear at the top
    this.listEl.insertBefore(card, this.listEl.firstChild);
  }

  private addSystemMessage(msg: string): void {
    const row = document.createElement("div");
    row.className = "text-xs text-[#8A8A8A] italic px-1 py-0.5";
    row.textContent = msg;
    this.listEl.insertBefore(row, this.listEl.firstChild);
  }

  private appendPlaceholder(): void {
    const placeholder = document.createElement("div");
    placeholder.id = "events-placeholder";
    placeholder.className = "text-sm text-[#8A8A8A] text-center mt-16 space-y-2";

    const line1 = document.createElement("div");
    line1.textContent = "No events yet.";
    placeholder.appendChild(line1);

    const line2 = document.createElement("div");
    line2.className = "text-xs";
    line2.textContent = "Click Connect to subscribe to the SSE stream, then run any flow to see events.";
    placeholder.appendChild(line2);

    this.listEl.appendChild(placeholder);
  }

  private removePlaceholder(): void {
    document.getElementById("events-placeholder")?.remove();
  }

  clear(): void {
    this.listEl.innerHTML = "";
    this.count = 0;
    this.countEl.textContent = "";
    if (!this.abort) {
      this.appendPlaceholder();
    } else {
      this.addSystemMessage("SSE stream connected — events will appear as they arrive.");
    }
  }
}

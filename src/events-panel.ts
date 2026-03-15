/**
 * Live Events panel — connects to GET /api/v0/events/stream (SSE via fetch)
 * and renders incoming events in real time, colour-coded by category.
 *
 * Designed to sit at the bottom of the flows view as a compact, always-visible
 * panel.  EventSource does not support custom headers, so we use fetch +
 * ReadableStream.
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
    this.container.classList.add("flex", "flex-col");

    // ── Compact header
    const header = document.createElement("div");
    header.className = "flex items-center justify-between px-3 py-1.5 bg-white border-b border-[#E5E3DE] shrink-0";

    const left = document.createElement("div");
    left.className = "flex items-center gap-2";

    const title = document.createElement("span");
    title.className = "text-xs font-semibold text-[#2ABFAB] uppercase tracking-wider";
    title.textContent = "Live Events";
    left.appendChild(title);

    this.statusDot = document.createElement("span");
    this.statusDot.className = "w-1.5 h-1.5 rounded-full bg-[#D4D2CC]";
    left.appendChild(this.statusDot);

    this.statusText = document.createElement("span");
    this.statusText.className = "text-[10px] text-[#6B6B6B]";
    this.statusText.textContent = "disconnected";
    left.appendChild(this.statusText);

    this.countEl = document.createElement("span");
    this.countEl.className = "text-[10px] text-[#8A8A8A]";
    left.appendChild(this.countEl);

    header.appendChild(left);

    const right = document.createElement("div");
    right.className = "flex items-center gap-1";

    const clearBtn = document.createElement("button");
    clearBtn.className = "px-1.5 py-0.5 rounded text-[10px] text-[#6B6B6B] hover:text-black hover:bg-[#F5F0EB] transition-colors";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", () => this.clear());
    right.appendChild(clearBtn);

    this.connectBtn = document.createElement("button");
    this.connectBtn.className = "px-2 py-0.5 rounded text-[10px] font-medium bg-[#2ABFAB] text-white hover:bg-[#24A896] transition-colors";
    this.connectBtn.textContent = "Connect";
    this.connectBtn.addEventListener("click", () => this.toggle());
    right.appendChild(this.connectBtn);

    header.appendChild(right);
    this.container.appendChild(header);

    // ── Event list
    this.listEl = document.createElement("div");
    this.listEl.className = "flex-1 overflow-y-auto px-3 py-2 space-y-1.5";

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
      error: "error — retry",
    };
    this.statusDot.style.backgroundColor = colours[state] ?? "#D4D2CC";
    this.statusDot.className = `w-1.5 h-1.5 rounded-full${state === "connecting" ? " pulse" : ""}`;
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
    this.removePlaceholder();
    this.abort = new AbortController();

    // 10-second timeout for initial connection (server may never respond)
    const timeout = setTimeout(() => {
      if (this.abort && this.statusText.textContent === "connecting…") {
        this.abort.abort();
        this.abort = null;
        this.setStatus("error");
        this.addSystemMessage("Connection timed out — server may be unreachable.");
      }
    }, 10_000);

    try {
      const authHeaders = await signRequest(this.wallet, "GET", "/api/v0/events/stream");
      const res = await fetch(`${BASE_URL}/events/stream`, {
        headers: authHeaders,
        signal: this.abort.signal,
      });

      clearTimeout(timeout);

      if (!res.ok || !res.body) {
        this.setStatus("error");
        this.addSystemMessage(`Connection failed: HTTP ${res.status}`);
        this.abort = null;
        return;
      }

      this.setStatus("connected");
      this.removePlaceholder();
      this.addSystemMessage("SSE stream connected — run any flow to see events.");

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
      clearTimeout(timeout);
      if (err instanceof Error && err.name === "AbortError") {
        // user-initiated disconnect or timeout — no extra error
      } else {
        this.setStatus("error");
        this.addSystemMessage(`Stream error: ${err instanceof Error ? err.message : String(err)}`);
        this.abort = null;
        return;
      }
    }

    if (this.statusText.textContent !== "error — retry") {
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
      .slice(11, 19); // just HH:MM:SS for compactness

    const card = document.createElement("div");
    card.className = "step-enter rounded border border-[#E5E3DE] bg-white px-2.5 py-1.5";

    const topRow = document.createElement("div");
    topRow.className = "flex items-center justify-between mb-0.5";

    const badge = document.createElement("span");
    badge.className = "text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white";
    badge.style.backgroundColor = colour;
    badge.textContent = eventType;
    topRow.appendChild(badge);

    const time = document.createElement("span");
    time.className = "text-[10px] text-[#8A8A8A] font-mono";
    time.textContent = ts;
    topRow.appendChild(time);

    card.appendChild(topRow);
    card.appendChild(renderJsonViewer(event, true));

    // Prepend so newest events appear at the top
    this.listEl.insertBefore(card, this.listEl.firstChild);
  }

  private addSystemMessage(msg: string): void {
    const row = document.createElement("div");
    row.className = "text-[10px] text-[#8A8A8A] italic px-1 py-0.5";
    row.textContent = msg;
    this.listEl.insertBefore(row, this.listEl.firstChild);
  }

  private appendPlaceholder(): void {
    const placeholder = document.createElement("div");
    placeholder.id = "events-placeholder";
    placeholder.className = "text-[11px] text-[#8A8A8A] text-center py-4";
    placeholder.textContent = "Run a flow to see live events.";
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
      this.addSystemMessage("SSE stream connected — run any flow to see events.");
    }
  }
}

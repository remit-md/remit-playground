import type { PlaygroundWallet } from "../wallet.js";

export interface StepResult {
  label: string;
  side: "agent" | "provider" | "both";
  request?: unknown;
  response?: unknown;
  error?: unknown;
}

export interface FlowContext {
  agent: PlaygroundWallet;
  provider: PlaygroundWallet;
  emit: (result: StepResult) => void;
}

export interface Flow {
  id: string;
  label: string;
  description: string;
  run: (ctx: FlowContext) => AsyncGenerator<StepResult>;
}

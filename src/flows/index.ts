export { x402Flow } from "./x402.js";
export { directFlow } from "./direct.js";
export { escrowFlow } from "./escrow.js";
export { tabFlow } from "./tab.js";
export { streamFlow } from "./stream.js";
export { bountyFlow } from "./bounty.js";
export { depositFlow } from "./deposit.js";

import { x402Flow } from "./x402.js";
import { directFlow } from "./direct.js";
import { escrowFlow } from "./escrow.js";
import { tabFlow } from "./tab.js";
import { streamFlow } from "./stream.js";
import { bountyFlow } from "./bounty.js";
import { depositFlow } from "./deposit.js";
import type { Flow } from "./types.js";

export const ALL_FLOWS: Flow[] = [x402Flow, directFlow, escrowFlow, tabFlow, streamFlow, bountyFlow, depositFlow];

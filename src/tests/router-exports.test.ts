import { handleMessage, handleSlashInteraction } from "../commands.js";

function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

async function run(): Promise<void> {
  assert(typeof handleMessage === "function", "handleMessage export missing");
  assert(typeof handleSlashInteraction === "function", "handleSlashInteraction export missing");
  process.exit(0);
}

run().catch(() => process.exit(1));

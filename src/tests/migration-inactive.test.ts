function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

async function run(): Promise<void> {
  const original = process.argv[1];
  process.argv[1] = "not-migrate-to-aiven.js";
  let exited = false;
  const originalExit = process.exit;
  // @ts-ignore
  process.exit = (code?: number): never => { exited = true; throw new Error(`unexpected exit ${code}`); };
  try {
    const mod = await import("../../openspec/changes/archive/migrate-to-aiven.js");
    assert(typeof mod.main === "function", "migration main function not exported");
    assert(!exited, "migration should be inactive on import");
  } finally {
    process.exit = originalExit;
    process.argv[1] = original;
  }
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });


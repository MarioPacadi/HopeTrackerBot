import { buildSlashCommands, getSpecs } from "../command-registry.js";

function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

async function run(): Promise<void> {
  const regex = /^[\p{Ll}\p{Lm}\p{Lo}\p{N}\p{sc=Devanagari}\p{sc=Thai}_-]+$/u;
  for (const s of getSpecs()) {
    const name = s.name.toLowerCase();
    assert(regex.test(name), `invalid command name: ${s.name}`);
  }
  const builders = buildSlashCommands();
  for (const b of builders) {
    const name = (b as any).name;
    assert(regex.test(name), `invalid built command name: ${name}`);
  }
  process.exit(0);
}

run().catch(() => process.exit(1));

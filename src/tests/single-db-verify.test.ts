import { readdirSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) files.push(...listFiles(p));
    else if (e.isFile()) files.push(p);
  }
  return files;
}

async function run(): Promise<void> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const files = listFiles(root).filter(f => f.endsWith(".ts") || f.endsWith(".md") || f.endsWith(".yml") || f.endsWith(".json"));
  const badPatterns = ["render.com"];
  for (const f of files) {
    if (f.endsWith("single-db-verify.test.ts")) continue;
    const content = readFileSync(f, "utf8");
    for (const pat of badPatterns) {
      assert(!content.includes(pat) || f.endsWith("migrate-to-aiven.ts"), `residual reference '${pat}' found in ${f}`);
    }
  }
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });

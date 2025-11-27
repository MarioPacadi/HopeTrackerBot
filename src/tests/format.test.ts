import { formatValues } from "../trait-display-manager.js";

function assertEqual(a: string, b: string): void {
  const at = a.trim();
  const bt = b.trim();
  if (at !== bt) throw new Error(`assertEqual failed\nExpected: ${bt}\nActual: ${at}`);
}

async function run(): Promise<void> {
  const text = formatValues("Alice", [
    { emoji: "🛡️", name: "Armor", amount: 2 },
    { emoji: "🪙", name: "Hope", amount: 3 },
    { emoji: "❤️", name: "Health", amount: 10 },
    { emoji: "🧠", name: "Stress", amount: 1 }
  ], "123", null, null);
  const expected = [
    "**Alice** (<@123>)",
    "- ❤️ HP: 10",
    "- 🧠 Stress: 1",
    "- 🛡️ Armor: 2",
    "- 🪙 Hope: 3"
  ].join("\n");
  console.log(text);
  assertEqual(text, expected);
  process.exit(0);
}

run().catch(() => process.exit(1));

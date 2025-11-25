import { formatValues } from "../trait-display-manager.js";

function assertEqual(a: string, b: string): void {
  if (a !== b) throw new Error(`assertEqual failed\nExpected: ${b}\nActual: ${a}`);
}

async function run(): Promise<void> {
  const text = formatValues("Alice", [
    { emoji: "🛡️", name: "Armor", amount: 2 },
    { emoji: "🪙", name: "Hope", amount: 3 },
    { emoji: "❤️", name: "Health", amount: 10 },
    { emoji: "🧠", name: "Stress", amount: 1 }
  ]);
  const expected = [
    "Alice | ❤️ HP: 10",
    "Alice | 🧠 Stress: 1",
    "Alice | 🛡️ Armor: 2",
    "Alice | 🪙 Hope: 3"
  ].join("\n");
  assertEqual(text, expected);
  process.exit(0);
}

run().catch(() => process.exit(1));

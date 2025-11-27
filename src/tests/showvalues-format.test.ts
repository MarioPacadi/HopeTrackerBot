import { formatShowValues, ShowEntry } from "../trait-display-manager.js";

function assertEqual(a: string, b: string): void {
  const at = a.trim();
  const bt = b.trim();
  if (at !== bt) throw new Error(`assertEqual failed\nExpected: ${bt}\nActual: ${at}`);
}

async function run(): Promise<void> {
  const entries: ShowEntry[] = [
    { userLabel: "Alice", discordUserId: "1", values: [ { emoji: "❤️", name: "Health", amount: 10 }, { emoji: "🧠", name: "Stress", amount: 1 } ] },
    { userLabel: "Bob", discordUserId: "2", values: [ { emoji: "❤️", name: "Health", amount: 8 } ] },
    { userLabel: "Cara", discordUserId: "3", values: [ { emoji: "🧠", name: "Stress", amount: 2 }, { emoji: "🛡️", name: "Armor", amount: 3 } ] },
  ];
  const text = formatShowValues(entries);
  const expected = [
    "Traits: Health",
    "**Bob** (<@2>)",
    "- ❤️ Health: _8_",
    "",
    "Traits: Armor, Stress",
    "**Cara** (<@3>)",
    "- 🧠 Stress: _2_",
    "- 🛡️ Armor: _3_",
    "",
    "Traits: Health, Stress",
    "**Alice** (<@1>)",
    "- ❤️ Health: _10_",
    "- 🧠 Stress: _1_"
  ].join("\n").trim();
  // Order of sections: by trait count asc; keys tie resolved lexicographically.
  // Within sections, entries remain in original order.
  console.log("TEXT:\n"+text);
  console.log("EXPECTED:\n"+expected);
  assertEqual(text, expected);
  process.exit(0);
}

run().catch(() => process.exit(1));

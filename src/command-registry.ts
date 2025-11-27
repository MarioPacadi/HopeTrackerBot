import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

type OptKind = "string" | "integer" | "user";
export interface SlashOptionSpec { name: string; kind: OptKind; required: boolean }
export interface CommandSpec { name: string; description: string; shared: boolean; permissions?: "manage_guild" | null; options?: ReadonlyArray<SlashOptionSpec> }

const specs: ReadonlyArray<CommandSpec> = [
  { name: "register", description: "Register user", shared: true, options: [{ name: "user", kind: "user", required: false }] },
  { name: "unregister", description: "Unregister user", shared: true, options: [{ name: "user", kind: "user", required: false }] },
  { name: "values", description: "Show your values", shared: true },
  { name: "showvalues", description: "Show table users and values", shared: true },
  { name: "update_trait", description: "Update a trait", shared: false, options: [
    { name: "trait", kind: "string", required: true },
    { name: "amount", kind: "integer", required: true },
    { name: "user", kind: "user", required: false }
  ] },
  { name: "addusertable", description: "Add user to table", shared: true, permissions: "manage_guild", options: [
    { name: "user", kind: "user", required: true }
  ] },
  { name: "removeusertable", description: "Remove user from table", shared: true, permissions: "manage_guild", options: [
    { name: "user", kind: "user", required: true }
  ] },
  { name: "createtype", description: "Create a trait type", shared: true, permissions: "manage_guild", options: [
    { name: "name", kind: "string", required: true },
    { name: "emoji", kind: "string", required: true }
  ] },
  { name: "deletetype", description: "Delete a trait type", shared: true, permissions: "manage_guild", options: [
    { name: "name", kind: "string", required: true }
  ] },
  { name: "gain", description: "Increase a trait", shared: true, options: [
    { name: "trait", kind: "string", required: true },
    { name: "amount", kind: "integer", required: false }
  ] },
  { name: "spend", description: "Decrease a trait", shared: true, options: [
    { name: "trait", kind: "string", required: true },
    { name: "amount", kind: "integer", required: false }
  ] },
  { name: "mark", description: "Decrease a trait", shared: true, options: [
    { name: "trait", kind: "string", required: true },
    { name: "amount", kind: "integer", required: false }
  ] },
  { name: "clear", description: "Increase a trait", shared: true, options: [
    { name: "trait", kind: "string", required: true },
    { name: "amount", kind: "integer", required: false }
  ] },
  { name: "remove_trait", description: "Remove a user's trait value", shared: false, permissions: "manage_guild", options: [
    { name: "trait", kind: "string", required: true },
    { name: "user", kind: "user", required: true }
  ] },
  { name: "setUserEmoji", description: "Set user emoji", shared: true, options: [
    { name: "emoji", kind: "string", required: true },
    { name: "position", kind: "integer", required: true },
    { name: "user", kind: "user", required: false }
  ] }
];

export function getSpecs(): ReadonlyArray<CommandSpec> { return specs; }
export function getSharedCommandNames(): ReadonlyArray<string> { return specs.filter(s => s.shared).map(s => s.name); }

export function buildSlashCommands(): ReadonlyArray<SlashCommandBuilder> {
  return specs.map(s => {
    const b = new SlashCommandBuilder().setName(s.name).setDescription(s.description);
    if (s.permissions === "manage_guild") {
      b.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
    }
    for (const o of s.options ?? []) {
      if (o.kind === "string") b.addStringOption(x => x.setName(o.name).setDescription(cap(o.name)).setRequired(o.required));
      else if (o.kind === "integer") b.addIntegerOption(x => x.setName(o.name).setDescription(cap(o.name)).setRequired(o.required));
      else if (o.kind === "user") b.addUserOption(x => x.setName(o.name).setDescription("Target user").setRequired(o.required));
    }
    return b;
  });
}

export interface ParityReport { missingInText: string[]; missingTextHandlers: string[]; optionMismatch: Array<{ name: string; expected: ReadonlyArray<SlashOptionSpec>; }>; }

export function validateTextParity(textNames: ReadonlyArray<string>): ParityReport {
  const sharedLower = new Set(getSharedCommandNames().map(n => n.toLowerCase()));
  const textSet = new Set(textNames.map(n => n.toLowerCase()));
  const missingInText: string[] = [];
  for (const n of sharedLower) if (!textSet.has(n)) missingInText.push(n);
  const missingTextHandlers: string[] = [];
  for (const n of textSet) if (!sharedLower.has(n)) missingTextHandlers.push(n);
  const optionMismatch: Array<{ name: string; expected: ReadonlyArray<SlashOptionSpec>; }> = [];
  for (const s of specs) {
    if (!s.shared) continue;
    if (s.options && s.options.length > 0) optionMismatch.push({ name: s.name, expected: s.options });
  }
  return { missingInText, missingTextHandlers, optionMismatch };
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

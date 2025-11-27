import { ChatInputCommandInteraction, GuildMember, Message, PermissionFlagsBits } from "discord.js";
import { getContainer } from "../di.js";

/** Returns commonly used services via DI to avoid scattered imports */
export function services(): {
  defaults: ReturnType<typeof getContainer>["defaults"];
  userService: ReturnType<typeof getContainer>["userService"];
  traitService: ReturnType<typeof getContainer>["traitService"];
  tableService: ReturnType<typeof getContainer>["tableService"];
  audits: ReturnType<typeof getContainer>["audits"];
} {
  const { defaults, userService, traitService, tableService, audits } = getContainer();
  return { defaults, userService, traitService, tableService, audits };
}

/** Parses an optional numeric amount from the given parts starting at startIndex. Defaults to 1 when invalid */
export function parseAmount(parts: ReadonlyArray<string>, startIndex: number): { amount: number; nextIndex: number } {
  if (parts.length <= startIndex) return { amount: 1, nextIndex: startIndex };
  const parsed = Number(parts[startIndex]);
  if (Number.isNaN(parsed)) return { amount: 1, nextIndex: startIndex };
  return { amount: parsed, nextIndex: startIndex + 1 };
}

/** Checks guild permissions for administrative actions (text commands) */
export function isAdmin(message: Message): boolean {
  const m = message.member;
  if (!m) return false;
  return m.permissions.has(PermissionFlagsBits.ManageGuild) || m.permissions.has(PermissionFlagsBits.Administrator);
}

/** Checks whether the interaction user is Admin or has the Game Master role */
export async function isAdminOrGMInteraction(it: ChatInputCommandInteraction): Promise<boolean> {
  const member = it.member;
  let hasAdmin = false;
  if (member && "permissions" in member) {
    const gm = member as GuildMember;
    hasAdmin = gm.permissions.has(PermissionFlagsBits.ManageGuild) || gm.permissions.has(PermissionFlagsBits.Administrator);
  }
  const gmRole = it.guild?.roles.cache.find(r => r.name.toLowerCase() === "game master");
  const hasGM = gmRole ? (member && "roles" in member ? (member as GuildMember).roles.cache.has(gmRole.id) : false) : false;
  return !!hasAdmin || !!hasGM;
}


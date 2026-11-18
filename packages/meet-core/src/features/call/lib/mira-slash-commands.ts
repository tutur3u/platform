export const miraSlashCommands = [
  'poll',
  'summary',
  'actions',
  'review',
] as const;
export type MiraSlashCommand = (typeof miraSlashCommands)[number];

export function matchMiraSlashCommands(draft: string) {
  const prefix = /^\/([a-z]*)$/i.exec(draft)?.[1]?.toLowerCase();
  if (prefix === undefined) return [];
  return miraSlashCommands.filter((command) => command.startsWith(prefix));
}

export function miraSlashCommandDraft(prompt: string) {
  return `@Tuturuuu ${prompt}`;
}

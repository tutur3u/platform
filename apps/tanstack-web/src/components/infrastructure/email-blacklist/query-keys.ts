export function emailBlacklistQueryKey(workspaceId: string) {
  return ['infrastructure', 'email-blacklist', workspaceId] as const;
}

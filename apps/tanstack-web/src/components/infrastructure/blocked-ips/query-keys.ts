export function blockedIpsQueryKey(workspaceId: string) {
  return ['infrastructure', 'blocked-ips', workspaceId] as const;
}

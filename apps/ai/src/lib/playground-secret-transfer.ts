// One-time handoff of a freshly created key from the API keys panel to the
// playground. The key stays in this module's memory only: it is never written
// to Web Storage, survives client-side navigation, and disappears on reload.
const stagedSecrets = new Map<string, string>();

export function stagePlaygroundSecret(workspaceId: string, secret: string) {
  stagedSecrets.clear();
  stagedSecrets.set(workspaceId, secret);
}

export function takePlaygroundSecret(workspaceId: string) {
  const secret = stagedSecrets.get(workspaceId) ?? '';
  stagedSecrets.delete(workspaceId);
  return secret;
}

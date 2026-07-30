const PREFIX = 'tuturuuu.ai-studio.playground-key.';

export function stagePlaygroundSecret(workspaceId: string, secret: string) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(`${PREFIX}${workspaceId}`, secret);
}

export function takePlaygroundSecret(workspaceId: string) {
  if (typeof sessionStorage === 'undefined') return '';
  const key = `${PREFIX}${workspaceId}`;
  const secret = sessionStorage.getItem(key) ?? '';
  sessionStorage.removeItem(key);
  return secret;
}

const LEGACY_PREFIX = 'tuturuuu.ai-studio.playground-key.';
const TRANSFER_TTL_MS = 60_000;

/**
 * A freshly created key is handed to the playground across a client-side
 * navigation only. It lives in module memory (never Web Storage), is scoped to
 * one workspace, consumed once, and expires quickly if never picked up.
 */
const pending = new Map<string, { secret: string; expiresAt: number }>();

function clearLegacyStorage(workspaceId: string) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(`${LEGACY_PREFIX}${workspaceId}`);
  } catch {
    // Storage can be unavailable (privacy mode); nothing to clean up then.
  }
}

export function stagePlaygroundSecret(workspaceId: string, secret: string) {
  pending.clear();
  pending.set(workspaceId, {
    secret,
    expiresAt: Date.now() + TRANSFER_TTL_MS,
  });
}

export function takePlaygroundSecret(workspaceId: string) {
  clearLegacyStorage(workspaceId);
  const entry = pending.get(workspaceId);
  pending.delete(workspaceId);
  if (!entry || entry.expiresAt <= Date.now()) return '';
  return entry.secret;
}

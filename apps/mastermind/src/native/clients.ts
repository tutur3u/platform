import type { MastermindEnvironment, Owner } from './auth';

/** One instance per isolate; only call after request authentication. */
export function createOwnerMemo<T>(now = Date.now) {
  const entries = new Map<string, { value: T; until: number }>();
  return {
    get(owner: Owner): T | undefined {
      const entry = entries.get(owner.id);
      if (!entry || now() >= entry.until || now() >= owner.expiresAt) {
        entries.delete(owner.id);
        return undefined;
      }
      return entry.value;
    },
    set(owner: Owner, value: T) {
      // Bounded memory, with no pending promise capable of resurrecting expired entries.
      if (entries.size >= 32) entries.clear();
      entries.set(owner.id, {
        value,
        until: Math.min(now() + 60_000, owner.expiresAt),
      });
    },
  };
}

/**
 * workerd rejects `redirect: 'error'` when the Request is built. Bearer-bearing
 * requests use `manual` and every redirect response is refused before the body
 * or `Location` is read.
 */
async function refuseRedirect(pending: Promise<Response>) {
  const response = await pending;
  if (
    String(response.type) === 'opaqueredirect' ||
    (response.status >= 300 && response.status < 400)
  ) {
    throw new Error('Upstream redirect refused');
  }
  return response;
}

/** W2 supplies validated response schemas; W1 never calls or renders these clients. */
export function createDataClients(env: MastermindEnvironment, owner: Owner) {
  return {
    agentSnapshot() {
      if (!env.OPS_HUB) throw new Error('Ops hub binding unavailable');
      // Hub-side owner checks still apply. No public Worker URL or gateway credential.
      return refuseRedirect(
        env.OPS_HUB.fetch(
          new Request('https://ops-hub/snapshot', {
            headers: { Authorization: `Bearer ${owner.token}` },
            redirect: 'manual',
          })
        )
      );
    },
    orgLinks(rootWorkspaceId: string) {
      return refuseRedirect(
        fetch(
          new Request(
            `https://tuturuuu.com/api/v1/workspaces/${encodeURIComponent(rootWorkspaceId)}/mastermind/org`,
            {
              headers: { Authorization: `Bearer ${owner.token}` },
              redirect: 'manual',
              cache: 'no-store',
            }
          )
        )
      );
    },
  };
}

import { ASSERTION_HEADER, signAssertion } from '@tuturuuu/ops-hub/protocol';

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

/** W2 supplies validated response schemas; W1 never calls or renders these clients. */
export function createDataClients(env: MastermindEnvironment, owner: Owner) {
  return {
    async agentSnapshot() {
      if (!env.OPS_HUB) throw new Error('Ops hub binding unavailable');
      const secret = env.OPS_HUB_MASTERMIND_SNAPSHOT_SECRET;
      if (
        !secret ||
        secret.length < 43 ||
        secret.length > 256 ||
        secret !== secret.trim()
      ) {
        throw new Error('Ops hub signing key unavailable');
      }
      return env.OPS_HUB.fetch(
        new Request('https://ops-hub/snapshot', {
          headers: {
            [ASSERTION_HEADER]: await signAssertion(
              secret,
              owner.id,
              'GET',
              '/snapshot',
              Date.now(),
              'mastermind'
            ),
          },
          redirect: 'error',
        })
      );
    },
    orgLinks(rootWorkspaceId: string) {
      return fetch(
        new Request(
          `https://tuturuuu.com/api/v1/workspaces/${encodeURIComponent(rootWorkspaceId)}/mastermind/org`,
          {
            headers: { Authorization: `Bearer ${owner.token}` },
            redirect: 'error',
            cache: 'no-store',
          }
        )
      );
    },
  };
}

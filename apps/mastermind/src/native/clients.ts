import {
  FLEET_FEATURES_HEADER,
  type FleetAnswerReceipt,
  type FleetAnswerRequest,
  type FleetSnapshot,
  fleetAnswerReceiptSchema,
  fleetStateResponseSchema,
} from '../fleet/contract';
import type { MastermindEnvironment, Owner } from './auth';
import {
  type FleetUsageResponse,
  fleetUsageResponseSchema,
} from '../../../web/src/lib/mastermind/fleet/usage-contract';

const WEB_FLEET = 'https://tuturuuu.com/api/v1/mastermind/fleet';

export type FleetRead =
  | { kind: 'ready'; snapshot: FleetSnapshot }
  | { kind: 'unpublished' }
  | { kind: 'error'; reason: 'denied' | 'unavailable' | 'invalid' };

export type FleetWrite =
  | { kind: 'sent'; receipt: FleetAnswerReceipt }
  | { kind: 'closed' }
  | { kind: 'error'; reason: 'denied' | 'unavailable' | 'invalid' };

type UsageRead =
  | { kind: 'ready'; usage: FleetUsageResponse }
  | Exclude<FleetRead, { kind: 'ready' }>;

type OwnerLiveTicket = { url: string; ticket: string; expiresAt: string };

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

function failure(status: number) {
  if (status === 401 || status === 403) return 'denied' as const;
  if (status === 422 || status === 400) return 'invalid' as const;
  return 'unavailable' as const;
}

/**
 * Web fleet API reads and answers with the owner's satellite bearer. Every
 * body is validated against the shared contract before it reaches a render.
 */
export function createFleetClient(owner: Owner, fetcher: typeof fetch = fetch) {
  const headers = {
    Authorization: `Bearer ${owner.token}`,
    [FLEET_FEATURES_HEADER]: 'login,review',
  };
  return {
    async liveTicket(): Promise<OwnerLiveTicket | null> {
      try {
        const response = await refuseRedirect(
          fetcher(
            new Request(`${WEB_FLEET}/live/ticket`, {
              method: 'POST',
              headers,
              redirect: 'manual',
              cache: 'no-store',
              signal: AbortSignal.timeout(8_000),
            })
          )
        );
        if (!response.ok) return null;
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object') return null;
        const { url, ticket, expiresAt } = body as Record<string, unknown>;
        if (
          typeof url !== 'string' ||
          typeof ticket !== 'string' ||
          typeof expiresAt !== 'string'
        )
          return null;
        return { url, ticket, expiresAt };
      } catch {
        return null;
      }
    },
    async usage(): Promise<UsageRead> {
      try {
        const response = await refuseRedirect(
          fetcher(
            new Request(`${WEB_FLEET}/usage`, {
              headers,
              redirect: 'manual',
              cache: 'no-store',
              signal: AbortSignal.timeout(8_000),
            })
          )
        );
        if (response.status === 404) return { kind: 'unpublished' };
        if (!response.ok)
          return { kind: 'error', reason: failure(response.status) };
        const parsed = fleetUsageResponseSchema.safeParse(
          await response.json()
        );
        return parsed.success
          ? { kind: 'ready', usage: parsed.data }
          : { kind: 'error', reason: 'invalid' };
      } catch {
        return { kind: 'error', reason: 'unavailable' };
      }
    },
    async state(): Promise<FleetRead> {
      try {
        const response = await refuseRedirect(
          fetcher(
            new Request(`${WEB_FLEET}/state`, {
              headers,
              redirect: 'manual',
              cache: 'no-store',
              signal: AbortSignal.timeout(8_000),
            })
          )
        );
        if (response.status === 404) return { kind: 'unpublished' };
        if (!response.ok)
          return { kind: 'error', reason: failure(response.status) };
        const parsed = fleetStateResponseSchema.safeParse(
          await response.json()
        );
        return parsed.success
          ? { kind: 'ready', snapshot: parsed.data }
          : { kind: 'error', reason: 'invalid' };
      } catch {
        return { kind: 'error', reason: 'unavailable' };
      }
    },
    async answer(input: FleetAnswerRequest): Promise<FleetWrite> {
      const { decisionId, idempotencyKey, ...body } = input;
      try {
        const response = await refuseRedirect(
          fetcher(
            new Request(
              `${WEB_FLEET}/decisions/${encodeURIComponent(decisionId)}/answer`,
              {
                method: 'POST',
                headers: {
                  ...headers,
                  'Content-Type': 'application/json',
                  'Idempotency-Key': idempotencyKey,
                },
                body: JSON.stringify(body),
                redirect: 'manual',
                cache: 'no-store',
                signal: AbortSignal.timeout(8_000),
              }
            )
          )
        );
        if (response.status === 409) return { kind: 'closed' };
        if (!response.ok)
          return { kind: 'error', reason: failure(response.status) };
        const parsed = fleetAnswerReceiptSchema.safeParse(
          await response.json()
        );
        return parsed.success
          ? { kind: 'sent', receipt: parsed.data }
          : { kind: 'error', reason: 'invalid' };
      } catch {
        return { kind: 'error', reason: 'unavailable' };
      }
    },
  };
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

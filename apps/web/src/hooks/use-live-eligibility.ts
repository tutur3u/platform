'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getLiveEligibility,
  type LiveCreditSource,
  type LiveEligibilityResponse,
} from '@tuturuuu/internal-api';
import {
  ACTOR_SCOPED_QUERY_ROOTS,
  useMiraSoulScope,
} from '@/components/mira-soul-scope';

export const LIVE_ELIGIBILITY_QUERY_KEY: (typeof ACTOR_SCOPED_QUERY_ROOTS)[number] =
  'live-eligibility';

/**
 * Billing details are per actor, so the cache is keyed by the server-verified
 * session (actor and sign-in revision), never by a cached profile.
 */
export function liveEligibilityQueryKey({
  actorId,
  sessionRevision = null,
  creditSource,
  creditWsId,
  wsId,
}: {
  actorId: string | null;
  sessionRevision?: string | null;
  creditSource: LiveCreditSource;
  creditWsId?: string;
  wsId: string;
}) {
  return [
    LIVE_ELIGIBILITY_QUERY_KEY,
    actorId,
    sessionRevision,
    wsId,
    creditSource,
    creditWsId ?? null,
  ] as const;
}

/**
 * Discriminated state of the Live start control. A failed pre-check is
 * `unknown`, not blocked: the token route still decides on start.
 */
export type LiveEntryState =
  | { status: 'checking' }
  | { status: 'eligible' }
  | { status: 'unknown' }
  | {
      status: 'blocked';
      eligibility: LiveEligibilityResponse & {
        reason: NonNullable<LiveEligibilityResponse['reason']>;
      };
    };

export function toLiveEntryState({
  data,
  isError,
}: {
  data: LiveEligibilityResponse | undefined;
  isError: boolean;
}): LiveEntryState {
  if (data) {
    if (data.eligible || !data.reason) return { status: 'eligible' };
    return {
      status: 'blocked',
      eligibility: { ...data, reason: data.reason },
    };
  }
  return isError ? { status: 'unknown' } : { status: 'checking' };
}

export function useLiveEligibility({
  creditSource,
  creditWsId,
  wsId,
}: {
  creditSource: LiveCreditSource;
  creditWsId?: string;
  wsId: string;
}) {
  const lease = useMiraSoulScope();
  const actorId = lease?.actorId ?? null;
  const query = useQuery({
    queryKey: liveEligibilityQueryKey({
      actorId,
      sessionRevision: lease?.sessionRevision ?? null,
      creditSource,
      creditWsId,
      wsId,
    }),
    queryFn: async () => {
      if (!lease) throw new Error('Live eligibility needs a session scope');
      const epoch = lease.epoch;
      const result = await getLiveEligibility({
        creditSource,
        creditWsId,
        wsId,
      });
      // A session change during the request discards its result.
      lease.check(epoch);
      return result;
    },
    enabled: Boolean(wsId && actorId),
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });

  // Without a verified actor the check cannot be scoped; the token route decides.
  if (!actorId) return { status: 'unknown' } as const;
  return toLiveEntryState({ data: query.data, isError: query.isError });
}

/** The workspace Live bills, for its billing links. */
export function liveBillingWsId({
  creditSource,
  creditWsId,
  wsId,
}: {
  creditSource: LiveCreditSource;
  creditWsId?: string;
  wsId: string;
}) {
  return creditWsId ?? (creditSource === 'workspace' ? wsId : 'personal');
}

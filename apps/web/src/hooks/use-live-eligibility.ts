'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getLiveEligibility,
  type LiveCreditSource,
  type LiveEligibilityResponse,
} from '@tuturuuu/internal-api';
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile';

export const LIVE_ELIGIBILITY_QUERY_KEY = 'live-eligibility';

/** Billing details are per actor, so the cache is scoped by actor too. */
export function liveEligibilityQueryKey({
  actorId,
  creditSource,
  creditWsId,
  wsId,
}: {
  actorId: string | null;
  creditSource: LiveCreditSource;
  creditWsId?: string;
  wsId: string;
}) {
  return [
    LIVE_ELIGIBILITY_QUERY_KEY,
    actorId,
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
  const profile = useCurrentUserProfile();
  const actorId = profile.data?.id ?? null;
  const query = useQuery({
    queryKey: liveEligibilityQueryKey({
      actorId,
      creditSource,
      creditWsId,
      wsId,
    }),
    queryFn: () => getLiveEligibility({ creditSource, creditWsId, wsId }),
    enabled: Boolean(wsId && actorId),
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });

  // Without a known actor the check cannot be scoped; the token route decides.
  if (!actorId && !profile.isPending) return { status: 'unknown' } as const;
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

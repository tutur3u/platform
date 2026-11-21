import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  FleetIntentInput,
  FleetIntentPage,
  FleetLinkConfirmationInput,
} from '@tuturuuu/internal-api/fleet';
import {
  confirmFleetLinkFn,
  fleetDigestFn,
  fleetIntentsFn,
  issueFleetLinkCodeFn,
  submitFleetIntentFn,
} from './api';
import type { FleetRead } from './upstream';

export const fleetKeys = {
  digest: ['fleet-access', 'digest'] as const,
  intents: ['fleet-access', 'intents'] as const,
};

export function useFleetDigest() {
  return useQuery({
    queryKey: fleetKeys.digest,
    queryFn: () => fleetDigestFn(),
    refetchInterval: 60_000,
  });
}

export function useFleetIntents() {
  return useInfiniteQuery<
    FleetRead<FleetIntentPage>,
    Error,
    InfiniteData<FleetRead<FleetIntentPage>, string | undefined>,
    typeof fleetKeys.intents,
    string | undefined
  >({
    queryKey: fleetKeys.intents,
    queryFn: ({ pageParam }) =>
      fleetIntentsFn({ data: pageParam ? { before: pageParam } : {} }),
    initialPageParam: undefined,
    getNextPageParam: (last) =>
      last.kind === 'ok' ? (last.data.nextBefore ?? undefined) : undefined,
  });
}

export function useSubmitFleetIntent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: FleetIntentInput) =>
      submitFleetIntentFn({ data: input }),
    onSuccess: (result) => {
      if (result.kind === 'ok') {
        return client.invalidateQueries({ queryKey: fleetKeys.intents });
      }
    },
  });
}

export function useIssueFleetLinkCode() {
  return useMutation({ mutationFn: () => issueFleetLinkCodeFn() });
}

export function useConfirmFleetLink() {
  return useMutation({
    mutationFn: (input: FleetLinkConfirmationInput) =>
      confirmFleetLinkFn({ data: input }),
  });
}

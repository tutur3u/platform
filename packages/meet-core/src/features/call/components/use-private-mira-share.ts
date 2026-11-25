'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type PrivateMiraPolicy,
  readPrivateMiraPolicy,
  setPrivateMiraShare,
} from '@tuturuuu/internal-api';

export type PrivateMiraShareControl = {
  enabled: boolean;
  pending: boolean;
  onChange: (enabled: boolean) => Promise<void>;
};

/**
 * The signed-in person's own share of notes and tutor chat with their Private
 * Mira in this meeting. Off until they turn it on; the server keeps the grant.
 */
export function usePrivateMiraShare(
  meetingId: string,
  accountId: string | undefined,
  active: boolean
): PrivateMiraShareControl | undefined {
  const queryClient = useQueryClient();
  const queryKey = ['mira-private-choice', meetingId];
  const policy = useQuery({
    queryKey,
    queryFn: () => readPrivateMiraPolicy(meetingId),
    enabled: active && !!accountId,
    retry: false,
  });
  const update = useMutation({
    mutationFn: (enabled: boolean) =>
      setPrivateMiraShare(meetingId, enabled, accountId ?? ''),
    onSuccess: (privateShare) =>
      queryClient.setQueryData<PrivateMiraPolicy>(queryKey, (current) =>
        current ? { ...current, privateShare } : current
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const data = policy.data;
  if (!active || !accountId || !data?.privateShare) return undefined;
  if (data.accountId !== accountId) return undefined;
  return {
    enabled: data.privateShare.enabled,
    pending: update.isPending,
    onChange: async (enabled) => {
      await update.mutateAsync(enabled);
    },
  };
}

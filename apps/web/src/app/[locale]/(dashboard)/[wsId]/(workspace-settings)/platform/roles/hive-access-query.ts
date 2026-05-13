'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type HiveMember, upsertHiveMember } from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';

export const HIVE_MEMBER_QUERY_KEY = ['hive-members'];
type HiveMembersQueryData = { members: HiveMember[] };
type HiveAccessMutationContext = {
  previousData?: HiveMembersQueryData;
};
type HiveAccessMutationVariables = {
  enabled: boolean;
  userId: string;
};

export function getHiveMemberMap(members: HiveMember[]) {
  return new Map(members.map((member) => [member.userId, member]));
}

export function useHiveAccessMutation({
  disabledToast,
  enabledToast,
  members,
  updateFailedToast,
}: {
  disabledToast: string;
  enabledToast: string;
  members: HiveMember[];
  updateFailedToast: string;
}) {
  const queryClient = useQueryClient();
  const memberByUserId = getHiveMemberMap(members);

  return useMutation<
    { member: HiveMember },
    Error,
    HiveAccessMutationVariables,
    HiveAccessMutationContext
  >({
    mutationFn: ({ enabled, userId }) =>
      upsertHiveMember({
        enabled,
        notes:
          memberByUserId.get(userId)?.notes ?? 'Managed from Platform Roles',
        userId,
      }),
    onError: (_error, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(HIVE_MEMBER_QUERY_KEY, context.previousData);
      }
      toast.error(updateFailedToast);
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: HIVE_MEMBER_QUERY_KEY });
      const previousData = queryClient.getQueryData<HiveMembersQueryData>(
        HIVE_MEMBER_QUERY_KEY
      );
      const now = new Date().toISOString();

      queryClient.setQueryData<HiveMembersQueryData>(
        HIVE_MEMBER_QUERY_KEY,
        (current) => {
          const currentMembers = current?.members ?? [];
          const existing = currentMembers.find(
            (member) => member.userId === variables.userId
          );
          const nextMember: HiveMember = {
            createdAt: existing?.createdAt ?? now,
            enabled: variables.enabled,
            id: existing?.id ?? `optimistic-${variables.userId}`,
            notes: existing?.notes ?? 'Managed from Platform Roles',
            userId: variables.userId,
          };

          return {
            members: existing
              ? currentMembers.map((member) =>
                  member.userId === variables.userId ? nextMember : member
                )
              : [...currentMembers, nextMember],
          };
        }
      );

      return { previousData };
    },
    onSuccess: ({ member }) => {
      queryClient.setQueryData<HiveMembersQueryData>(
        HIVE_MEMBER_QUERY_KEY,
        (current) => {
          const currentMembers = current?.members ?? [];
          const exists = currentMembers.some(
            (entry) => entry.userId === member.userId
          );

          return {
            members: exists
              ? currentMembers.map((entry) =>
                  entry.userId === member.userId ? member : entry
                )
              : [...currentMembers, member],
          };
        }
      );
      toast.success(member.enabled ? enabledToast : disabledToast);
    },
  });
}

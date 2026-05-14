'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  approveHiveAccessRequest,
  type HiveAccessRequest,
  type HiveMember,
  upsertHiveMember,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';

export const HIVE_ACCESS_REQUEST_QUERY_KEY = ['hive-access-requests'];
export const HIVE_MEMBER_QUERY_KEY = ['hive-members'];
type HiveAccessRequestsQueryData = { requests: HiveAccessRequest[] };
type HiveMembersQueryData = { members: HiveMember[] };
type HiveAccessMutationContext = {
  previousData?: HiveMembersQueryData;
};
type HiveAccessMutationVariables = {
  enabled: boolean;
  userId: string;
};
type HiveAccessApprovalMutationContext = {
  previousMembers?: HiveMembersQueryData;
  previousRequests?: HiveAccessRequestsQueryData;
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

export function useHiveAccessApprovalMutation({
  approveFailedToast,
  approvedToast,
}: {
  approveFailedToast: string;
  approvedToast: string;
}) {
  const queryClient = useQueryClient();

  return useMutation<
    { member: HiveMember; request: HiveAccessRequest },
    Error,
    { notes?: string | null; requestId: string },
    HiveAccessApprovalMutationContext
  >({
    mutationFn: ({ notes, requestId }) =>
      approveHiveAccessRequest(requestId, { notes }),
    onError: (_error, _variables, context) => {
      if (context?.previousMembers) {
        queryClient.setQueryData(
          HIVE_MEMBER_QUERY_KEY,
          context.previousMembers
        );
      }
      if (context?.previousRequests) {
        queryClient.setQueryData(
          HIVE_ACCESS_REQUEST_QUERY_KEY,
          context.previousRequests
        );
      }
      toast.error(approveFailedToast);
    },
    onMutate: async ({ requestId }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: HIVE_MEMBER_QUERY_KEY }),
        queryClient.cancelQueries({ queryKey: HIVE_ACCESS_REQUEST_QUERY_KEY }),
      ]);
      const previousMembers = queryClient.getQueryData<HiveMembersQueryData>(
        HIVE_MEMBER_QUERY_KEY
      );
      const previousRequests =
        queryClient.getQueryData<HiveAccessRequestsQueryData>(
          HIVE_ACCESS_REQUEST_QUERY_KEY
        );

      queryClient.setQueryData<HiveAccessRequestsQueryData>(
        HIVE_ACCESS_REQUEST_QUERY_KEY,
        (current) => ({
          requests: (current?.requests ?? []).filter(
            (request) => request.id !== requestId
          ),
        })
      );

      return { previousMembers, previousRequests };
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
      toast.success(approvedToast);
    },
  });
}

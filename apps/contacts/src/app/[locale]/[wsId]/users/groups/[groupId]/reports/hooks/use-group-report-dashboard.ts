'use client';

import { useQuery } from '@tanstack/react-query';
import { listWorkspaceGroupReportDashboard } from '@tuturuuu/internal-api';

export function useGroupReportDashboard({
  wsId,
  groupId,
  userId,
  reportId,
  userQuery,
}: {
  wsId: string;
  groupId: string;
  userId: string | null;
  reportId: string | null;
  userQuery: string;
}) {
  const subjectKey = [
    'ws',
    wsId,
    'group',
    groupId,
    'reports-dashboard',
    userId,
    reportId,
  ];

  return useQuery({
    queryKey: [...subjectKey, userQuery],
    queryFn: () =>
      listWorkspaceGroupReportDashboard({
        workspaceId: wsId,
        groupId,
        userId,
        reportId,
        userQuery,
      }),
    enabled: Boolean(wsId && groupId),
    // Search may retain an editor, but another subject must load its own data
    // before selection recovery or report mutations can consume that response.
    placeholderData: (data, query) =>
      subjectKey.every((value, index) => value === query?.queryKey[index])
        ? data
        : undefined,
    staleTime: 30_000,
  });
}

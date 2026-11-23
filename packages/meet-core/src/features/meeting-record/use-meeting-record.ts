'use client';

import { useQuery } from '@tanstack/react-query';
import { getMeetingRecord } from '@tuturuuu/internal-api/meet-record';

export const meetingRecordQueryKey = (wsId: string, meetingId: string) =>
  ['meeting-record', wsId, meetingId] as const;

export const sinceLastTimeQueryKey = (wsId: string, meetingId: string) =>
  ['meeting-record-since', wsId, meetingId] as const;

export function useMeetingRecord(wsId: string, meetingId: string) {
  return useQuery({
    queryKey: meetingRecordQueryKey(wsId, meetingId),
    queryFn: () => getMeetingRecord(wsId, meetingId),
  });
}

export function taskHref(
  tasksUrl: string,
  workspaceSlug: string,
  taskId: string
) {
  return `${tasksUrl}/${encodeURIComponent(workspaceSlug)}/tasks/${encodeURIComponent(taskId)}`;
}

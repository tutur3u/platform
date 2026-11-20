'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  encodePathSegment,
  getInternalApiClient,
  InternalApiError,
} from '@tuturuuu/internal-api/client';
import type {
  BoardItem,
  ClassroomMutation,
} from '@tuturuuu/realtime/meet/classroom-tools-schema';
import type { BreakoutsView } from '@tuturuuu/realtime/meet/room-breakouts';
import type { WhiteboardView } from '@tuturuuu/realtime/meet/room-whiteboard';

export type ClassroomTool = 'whiteboard' | 'breakouts';
type View = {
  whiteboard: WhiteboardView & { items: BoardItem[] };
  breakouts: BreakoutsView;
};

const classroomPath = (meetingId: string) =>
  `/api/meet-call/${encodePathSegment(meetingId)}/classroom-tools`;

function isWhiteboard(view?: View[ClassroomTool]): view is View['whiteboard'] {
  return !!view && 'revision' in view;
}

export function useClassroomTool(
  tool: ClassroomTool,
  meetingId: string,
  accountId: string
) {
  const client = useQueryClient();
  const key = ['meet-classroom-tool', meetingId, accountId, tool] as const;
  const path = classroomPath(meetingId);
  const query = useQuery<View[ClassroomTool]>({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const api = getInternalApiClient();
      if (tool === 'breakouts')
        return api.json<BreakoutsView>(`${path}?action=breakouts.read`, {
          signal,
        });
      const previous = client.getQueryData<View[ClassroomTool]>(key);
      const params = new URLSearchParams({ action: 'whiteboard.read' });
      if (isWhiteboard(previous)) params.set('since', previous.revision);
      const view = await api.json<WhiteboardView>(`${path}?${params}`, {
        signal,
      });
      if (view.items) return { ...view, items: view.items };
      if (isWhiteboard(previous) && view.revision === previous.revision)
        return { ...view, items: previous.items };
      throw new Error('Whiteboard response is missing the drawing');
    },
    refetchInterval: ({ state }) =>
      state.error instanceof InternalApiError &&
      [401, 403, 404].includes(state.error.status)
        ? false
        : 3000,
    gcTime: 0,
    retry: false,
  });
  const action = useMutation({
    mutationFn: (command: ClassroomMutation) =>
      getInternalApiClient().json<{ ok: true }>(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      }),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
    retry: false,
  });
  return { query, action };
}

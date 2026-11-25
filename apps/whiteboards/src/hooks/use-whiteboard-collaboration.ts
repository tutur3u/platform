import { createRealtimeClient } from '@tuturuuu/internal-api/realtime';
import { useOptionalWorkspacePresenceContext } from '@tuturuuu/tasks-ui/tu-do/providers/workspace-presence-provider';
import { usePageVisibility } from '@tuturuuu/ui/hooks/use-page-visibility';
import { resolveUserDisplayName } from '@tuturuuu/utils/name-helper';
import type {
  WhiteboardIdentity,
  WhiteboardPresenceMember,
} from '@tuturuuu/whiteboard';
import { createRealtimeWhiteboardTransport } from '@tuturuuu/whiteboard/realtime';
import type { WhiteboardCollaborationConfig } from '@tuturuuu/whiteboard/react';
import { useMemo } from 'react';

export interface WorkspaceWhiteboardCollaboration {
  /** Collaboration settings for the editor; undefined when realtime is off. */
  collaboration: WhiteboardCollaborationConfig | undefined;
  realtimeEnabled: boolean;
  currentUserId: string | undefined;
}

/**
 * Resolves who is on the board and how it syncs. The workspace presence
 * provider supplies identity and roster; without one (or in a personal
 * workspace, where the provider is idle) the board is edited alone.
 */
export function useWorkspaceWhiteboardCollaboration({
  wsId,
  boardId,
}: {
  wsId: string;
  boardId: string;
}): WorkspaceWhiteboardCollaboration {
  const wsPresence = useOptionalWorkspacePresenceContext();
  const pageVisible = usePageVisibility();

  const realtimeEnabled =
    (wsPresence?.realtimeEnabled ?? false) && !!wsPresence?.currentUserId;
  const currentUserId = wsPresence?.currentUserId;
  const presenceState = wsPresence?.presenceState;
  const self = currentUserId ? presenceState?.[currentUserId]?.[0]?.user : null;

  const user = useMemo<WhiteboardIdentity>(
    () => ({
      id: currentUserId || '',
      displayName: resolveUserDisplayName(self, {
        emailLocalPart: true,
        fallback: 'Unknown',
      }),
      avatarUrl: self?.avatar_url || undefined,
    }),
    [currentUserId, self]
  );

  const transport = useMemo(
    () =>
      createRealtimeWhiteboardTransport({
        channelName: `whiteboard-${wsId}-${boardId}`,
        createClient: () => createRealtimeClient(),
      }),
    [wsId, boardId]
  );

  const presence = useMemo<WhiteboardPresenceMember[] | undefined>(() => {
    if (!presenceState) return undefined;

    const members: WhiteboardPresenceMember[] = [];
    for (const [userId, presences] of Object.entries(presenceState)) {
      const first = presences[0];
      if (!first) continue;

      members.push({
        id: userId,
        displayName: resolveUserDisplayName(first.user, {
          emailLocalPart: true,
          fallback: 'Unknown',
        }),
        avatarUrl: first.user.avatar_url || undefined,
      });
    }
    return members;
  }, [presenceState]);

  const collaboration = useMemo<WhiteboardCollaborationConfig | undefined>(
    () =>
      realtimeEnabled
        ? { transport, user, presence, pageVisible, enabled: true }
        : undefined,
    [realtimeEnabled, transport, user, presence, pageVisible]
  );

  return { collaboration, realtimeEnabled, currentUserId };
}

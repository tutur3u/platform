import { createRealtimeClient } from '@tuturuuu/internal-api/realtime';
import { createClient } from '@tuturuuu/supabase/next/client';
import { useOptionalWorkspacePresenceContext } from '@tuturuuu/tasks-ui/tu-do/providers/workspace-presence-provider';
import type { User } from '@tuturuuu/types/primitives/User';
import { toast } from '@tuturuuu/ui/sonner';
import { usePageVisibility } from '@tuturuuu/ui/hooks/use-page-visibility';
import { resolveUserDisplayName } from '@tuturuuu/utils/name-helper';
import type {
  WhiteboardIdentity,
  WhiteboardPresenceMember,
} from '@tuturuuu/whiteboard';
import { createRealtimeWhiteboardTransport } from '@tuturuuu/whiteboard/realtime';
import type { WhiteboardCollaborationConfig } from '@tuturuuu/whiteboard/react';
import { useEffect, useMemo, useState } from 'react';

export interface WorkspaceWhiteboardCollaboration {
  /** Collaboration settings for the editor; undefined when realtime is off. */
  collaboration: WhiteboardCollaborationConfig | undefined;
  realtimeEnabled: boolean;
  currentUserId: string | undefined;
}

/**
 * Resolves who is on the board and how it syncs: the workspace presence
 * provider supplies identity and roster; without one, the signed-in user is
 * looked up directly.
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

  const realtimeEnabled = wsPresence?.realtimeEnabled ?? false;
  const externalUserId = wsPresence?.currentUserId;

  const [fetchedUserId, setFetchedUserId] = useState<string>();
  const [userData, setUserData] = useState<User | null>(null);

  useEffect(() => {
    if (!realtimeEnabled || !boardId) return;
    if (externalUserId) {
      setFetchedUserId(externalUserId);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    const fetchCurrentUser = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (cancelled || !user?.id) return;

        const { data } = await supabase
          .from('users')
          .select('display_name, avatar_url')
          .eq('id', user.id)
          .single();

        if (cancelled) return;

        setFetchedUserId(user.id);
        setUserData({
          id: user.id,
          display_name: data?.display_name,
          email: user.email,
          avatar_url: data?.avatar_url,
        });
      } catch (error) {
        console.error('Collaboration error:', error);
        toast.error('Collaboration connection issue. Changes may not sync.');
      }
    };

    void fetchCurrentUser();

    return () => {
      cancelled = true;
    };
  }, [boardId, externalUserId, realtimeEnabled]);

  const currentUserId = externalUserId || fetchedUserId;

  const user = useMemo<WhiteboardIdentity>(
    () => ({
      id: currentUserId || '',
      displayName: resolveUserDisplayName(userData, {
        emailLocalPart: true,
        fallback: 'Unknown',
      }),
      avatarUrl: userData?.avatar_url || undefined,
    }),
    [currentUserId, userData]
  );

  const transport = useMemo(
    () =>
      createRealtimeWhiteboardTransport({
        channelName: `whiteboard-${wsId}-${boardId}`,
        createClient: () => createRealtimeClient(),
      }),
    [wsId, boardId]
  );

  const presenceState = wsPresence?.presenceState;
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

import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { Collaborator, SocketId } from '@excalidraw/excalidraw/types';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import type { User } from '@tuturuuu/types/primitives/User';
import type { WorkspacePresenceState } from '@tuturuuu/ui/hooks/use-workspace-presence';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useExcalidrawCursor } from './useExcalidrawCursor';
import { useExcalidrawElementSync } from './useExcalidrawElementSync';

export interface CurrentUserInfo {
  id: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
}

// Collaboration colors (distinct, accessible colors)
const COLLABORATOR_COLORS = [
  '#E57373', // Red
  '#64B5F6', // Blue
  '#81C784', // Green
  '#FFB74D', // Orange
  '#BA68C8', // Purple
  '#4DD0E1', // Cyan
  '#F06292', // Pink
  '#AED581', // Light Green
  '#FFD54F', // Amber
  '#7986CB', // Indigo
] as const;

/**
 * Assigns a deterministic color to a user based on their ID
 * This ensures the same user always gets the same color across sessions
 */
function getCollaboratorColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return COLLABORATOR_COLORS[Math.abs(hash) % COLLABORATOR_COLORS.length]!;
}

export interface WhiteboardCollaborator {
  id: string;
  displayName: string;
  avatarUrl?: string;
  color: string;
  cursor?: {
    x: number;
    y: number;
    tool?: string;
  };
  onlineAt: string;
}

export interface UseWhiteboardCollaborationConfig {
  boardId: string;
  wsId: string;
  enabled?: boolean;
  /** External presence state from workspace presence provider */
  externalPresenceState?: RealtimePresenceState<WorkspacePresenceState>;
  externalCurrentUserId?: string;
  onRemoteElementsChange?: (elements: ExcalidrawElement[]) => void;
  onError?: (error: Error) => void;
}

export interface UseWhiteboardCollaborationResult {
  // State
  collaborators: Map<SocketId, Collaborator>;
  currentUserId: string | undefined;
  isConnected: boolean;
  isSynced: boolean;

  // Actions
  broadcastElementChanges: (
    previousElements: readonly ExcalidrawElement[],
    currentElements: readonly ExcalidrawElement[]
  ) => void;
  broadcastCursorPosition: (x: number, y: number, tool?: string) => void;
}

export function useWhiteboardCollaboration({
  boardId,
  wsId,
  enabled = true,
  externalPresenceState,
  externalCurrentUserId,
  onRemoteElementsChange,
  onError,
}: UseWhiteboardCollaborationConfig): UseWhiteboardCollaborationResult {
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [currentUserData, setCurrentUserData] = useState<User | null>(null);
  const isCleanedUpRef = useRef(false);

  const channelName = `whiteboard-${wsId}-${boardId}`;

  // Use external user ID if provided, otherwise fetch locally
  const resolvedUserId = externalCurrentUserId || currentUserId;

  // Fetch current user data (needed for cursor broadcasting even when using workspace presence)
  useEffect(() => {
    if (!enabled || !boardId) return;
    // Skip user fetch if external presence provides the user ID
    if (externalCurrentUserId) {
      setCurrentUserId(externalCurrentUserId);
      return;
    }

    isCleanedUpRef.current = false;
    const supabase = createClient();

    const fetchCurrentUser = async () => {
      if (isCleanedUpRef.current) return;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) return;

        const { data: userData } = await supabase
          .from('users')
          .select('display_name, avatar_url')
          .eq('id', user.id)
          .single();

        setCurrentUserId(user.id);
        setCurrentUserData({
          id: user.id,
          display_name: userData?.display_name,
          email: user.email,
          avatar_url: userData?.avatar_url,
        });
      } catch (error) {
        if (onError && error instanceof Error) {
          onError(error);
        }
      }
    };

    fetchCurrentUser();

    return () => {
      isCleanedUpRef.current = true;
    };
  }, [boardId, enabled, externalCurrentUserId, onError]);

  // Create current user object with color
  const currentUser = useMemo<CurrentUserInfo>(() => {
    return {
      id: resolvedUserId || '',
      displayName: currentUserData?.display_name || 'Unknown',
      email: currentUserData?.email || '',
      avatarUrl: currentUserData?.avatar_url || undefined,
    };
  }, [currentUserData, resolvedUserId]);

  // Set up element sync (independent of presence)
  const {
    broadcastChanges: broadcastElementChanges,
    isConnected: isElementSyncConnected,
    error: elementSyncError,
  } = useExcalidrawElementSync({
    channelName,
    userId: resolvedUserId || '',
    enabled: enabled && !!resolvedUserId,
    onRemoteChanges: onRemoteElementsChange,
    onError,
  });

  // Set up cursor sync (independent of presence)
  const {
    remoteCursors,
    broadcastCursor: broadcastCursorPosition,
    isConnected: isCursorConnected,
    error: cursorError,
  } = useExcalidrawCursor({
    channelName,
    user: currentUser,
    enabled: enabled && !!resolvedUserId,
  });

  // Build collaborators from external workspace presence (if provided) or from cursor data
  const collaborators = useMemo(() => {
    const collabMap = new Map<SocketId, Collaborator>();

    if (externalPresenceState) {
      // Use workspace presence for user list
      for (const [userId, presences] of Object.entries(externalPresenceState)) {
        const presence = presences[0];
        if (!presence) continue;

        const cursor = remoteCursors.get(userId);
        const color = {
          background: getCollaboratorColor(userId),
          stroke: getCollaboratorColor(userId),
        };

        collabMap.set(userId as SocketId, {
          id: userId,
          socketId: userId as SocketId,
          username: presence.user.display_name || 'Unknown',
          avatarUrl: presence.user.avatar_url || undefined,
          color,
          pointer: cursor
            ? {
                x: cursor.x,
                y: cursor.y,
                tool: cursor.tool as 'pointer' | 'laser',
              }
            : undefined,
        });
      }
    } else {
      // Fallback: build from cursor data only
      for (const [userId, cursor] of remoteCursors.entries()) {
        const color = {
          background: getCollaboratorColor(userId),
          stroke: getCollaboratorColor(userId),
        };

        collabMap.set(userId as SocketId, {
          id: userId,
          socketId: userId as SocketId,
          username: 'Collaborator',
          color,
          pointer: {
            x: cursor.x,
            y: cursor.y,
            tool: cursor.tool as 'pointer' | 'laser',
          },
        });
      }
    }

    return collabMap;
  }, [externalPresenceState, remoteCursors]);

  // Overall connection status (no separate presence channel needed)
  const isConnected = isElementSyncConnected && isCursorConnected;
  const isSynced = isConnected && !elementSyncError && !cursorError;

  return {
    collaborators,
    isConnected,
    isSynced,
    currentUserId: resolvedUserId,
    broadcastElementChanges,
    broadcastCursorPosition,
  };
}

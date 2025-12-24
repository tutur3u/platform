import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import type { User } from '@tuturuuu/types/primitives/User';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type ElementChange, mergeElements } from '@/utils/excalidraw-helper';
import {
  type ExcalidrawCursorPosition,
  useExcalidrawCursor,
} from './useExcalidrawCursor';
import { useExcalidrawElementSync } from './useExcalidrawElementSync';
import {
  type CurrentUserInfo,
  type UserPresenceState,
  useExcalidrawPresence,
} from './useExcalidrawPresence';

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
  onRemoteElementsChange?: (elements: ExcalidrawElement[]) => void;
  onError?: (error: Error) => void;
}

export interface UseWhiteboardCollaborationResult {
  // State
  collaborators: Map<string, WhiteboardCollaborator>;
  presenceState: RealtimePresenceState<UserPresenceState>;
  currentUserId: string | undefined;
  isConnected: boolean;
  isSynced: boolean;

  // Actions
  broadcastElementChanges: (
    previousElements: readonly ExcalidrawElement[],
    currentElements: readonly ExcalidrawElement[]
  ) => void;
  broadcastCursorPosition: (x: number, y: number, tool?: string) => void;
  disconnect: () => void;
}

export function useWhiteboardCollaboration({
  boardId,
  wsId,
  enabled = true,
  onRemoteElementsChange,
  onError,
}: UseWhiteboardCollaborationConfig): UseWhiteboardCollaborationResult {
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [currentUserData, setCurrentUserData] = useState<User | null>(null);
  const isCleanedUpRef = useRef(false);

  const channelName = `whiteboard-${wsId}-${boardId}`;

  // Fetch current user data
  useEffect(() => {
    if (!enabled || !boardId) return;

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
  }, [boardId, enabled, onError]);

  // Create current user object with color
  const currentUser = useMemo<CurrentUserInfo>(() => {
    return {
      id: currentUserId || '',
      displayName: currentUserData?.display_name || 'Unknown',
      avatarUrl: currentUserData?.avatar_url || undefined,
      color: currentUserId ? getCollaboratorColor(currentUserId) : '#808080',
    };
  }, [currentUserData, currentUserId]);

  // Set up presence tracking
  const {
    presenceState,
    isConnected: isPresenceConnected,
    disconnect: disconnectPresence,
  } = useExcalidrawPresence({
    channelName,
    currentUser,
    enabled: enabled && !!boardId,
    onError,
  });

  // Set up element sync
  const {
    broadcastChanges: broadcastElementChanges,
    isConnected: isElementSyncConnected,
    error: elementSyncError,
  } = useExcalidrawElementSync({
    channelName,
    userId: currentUserId || '',
    enabled: enabled && !!currentUserId,
    onRemoteChanges: onRemoteElementsChange,
    onError,
  });

  // Set up cursor sync
  const {
    remoteCursors,
    broadcastCursor: broadcastCursorPosition,
    isConnected: isCursorConnected,
    error: cursorError,
  } = useExcalidrawCursor({
    channelName,
    user: currentUser,
    enabled: enabled && !!currentUserId,
  });

  // Combine presence state with cursor positions to create collaborators
  const collaborators = useMemo(() => {
    const collabMap = new Map<string, WhiteboardCollaborator>();

    // Add users from presence state
    for (const [userId, presences] of Object.entries(presenceState)) {
      const presence = presences[0]; // Take first presence entry
      if (!presence) continue;

      const cursor = remoteCursors.get(userId);
      const color = getCollaboratorColor(userId);

      collabMap.set(userId, {
        id: userId,
        displayName: presence.user.display_name || 'Unknown',
        avatarUrl: presence.user.avatar_url || undefined,
        color,
        cursor: cursor
          ? {
              x: cursor.x,
              y: cursor.y,
              tool: cursor.tool,
            }
          : undefined,
        onlineAt: presence.online_at,
      });
    }

    return collabMap;
  }, [presenceState, remoteCursors]);

  // Overall connection status
  const isConnected =
    isPresenceConnected && isElementSyncConnected && isCursorConnected;
  const isSynced = isConnected && !elementSyncError && !cursorError;

  return {
    collaborators,
    presenceState,
    isConnected,
    isSynced,
    currentUserId,
    broadcastElementChanges,
    broadcastCursorPosition,
    disconnect: disconnectPresence,
  };
}

// Re-export types and utilities
export type { ElementChange, ExcalidrawCursorPosition };
export { mergeElements };

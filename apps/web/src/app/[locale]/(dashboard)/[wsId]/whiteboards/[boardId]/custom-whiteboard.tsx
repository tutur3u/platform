'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, WifiIcon, WifiOffIcon } from '@tuturuuu/icons';
import { useOptionalWorkspacePresenceContext } from '@tuturuuu/tasks-ui/tu-do/providers/workspace-presence-provider';
import {
  PresenceAvatarList,
  type PresenceViewerEntry,
} from '@tuturuuu/tasks-ui/tu-do/shared/user-presence-avatars';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import type { WhiteboardSnapshot } from '@tuturuuu/whiteboard';
import {
  WhiteboardEditor,
  type WhiteboardEditorHandle,
  type WhiteboardEditorStatus,
  type WhiteboardNotice,
} from '@tuturuuu/whiteboard/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceWhiteboardCollaboration } from '@/hooks/useWhiteboardCollaboration';
import {
  createWorkspaceWhiteboardAssets,
  createWorkspaceWhiteboardPersistence,
} from '@/lib/whiteboards/workspace-adapters';
import { WhiteboardSyncIndicator } from './whiteboard-sync-indicator';
import { WhiteboardTitle } from './whiteboard-title';

interface CustomWhiteboardProps {
  wsId: string;
  boardId: string;
  boardName: string;
  initialData?: WhiteboardSnapshot;
}

const VIEWPORT_STORAGE_KEY_PREFIX = 'whiteboard-viewport';

const INITIAL_STATUS: WhiteboardEditorStatus = {
  syncStatus: 'synced',
  lastSyncError: null,
  isConnected: false,
};

function showNotice(notice: WhiteboardNotice) {
  switch (notice.kind) {
    case 'save-failed':
      toast.error('Failed to save whiteboard', {
        description: 'Your changes may not be saved. Click to retry.',
        action: { label: 'Retry', onClick: notice.retry },
      });
      return;
    case 'collaboration-error':
      console.error('Collaboration error:', notice.error);
      toast.error('Collaboration connection issue. Changes may not sync.');
      return;
    case 'paste-image-unreadable':
      toast.error('Failed to read image from clipboard', {
        description:
          'Try copying the image again or use the file upload tool instead.',
      });
      return;
    case 'paste-image-restricted':
      toast.error('Cannot paste image from clipboard', {
        description:
          'Your browser may restrict clipboard access. Try using the file upload tool in the toolbar instead.',
      });
      return;
  }
}

export function CustomWhiteboard({
  wsId,
  boardId,
  boardName,
  initialData,
}: CustomWhiteboardProps) {
  const { resolvedTheme } = useTheme();
  const t = useTranslations('ws-presence');
  const wsPresence = useOptionalWorkspacePresenceContext();
  const { collaboration, realtimeEnabled, currentUserId } =
    useWorkspaceWhiteboardCollaboration({ wsId, boardId });

  const editorRef = useRef<WhiteboardEditorHandle>(null);
  const [status, setStatus] = useState(INITIAL_STATUS);

  const persistence = useMemo(
    () => createWorkspaceWhiteboardPersistence({ wsId, boardId }),
    [wsId, boardId]
  );
  const assets = useMemo(
    () => createWorkspaceWhiteboardAssets({ wsId, boardId }),
    [wsId, boardId]
  );

  // The stored snapshot is read here, not in the editor, so the app's query
  // cache owns retries, dedupe and refetch triggers.
  const { data: storedSnapshot, refetch: refetchSnapshot } = useQuery({
    queryKey: ['whiteboard-snapshot', wsId, boardId],
    queryFn: () => persistence.load(),
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: true,
  });

  // Catch up on edits missed while the live connection was down.
  const wasConnectedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (wasConnectedRef.current === false && status.isConnected) {
      void refetchSnapshot();
    }
    wasConnectedRef.current = status.isConnected;
  }, [status.isConnected, refetchSnapshot]);

  const wsUpdateLocation = wsPresence?.updateLocation;
  const whiteboardViewers = wsPresence?.getWhiteboardViewers(boardId) ?? [];

  const whiteboardViewerEntries = useMemo<PresenceViewerEntry[]>(() => {
    const byUser = new Map<
      string,
      {
        user: (typeof whiteboardViewers)[0]['user'];
        online_at: string;
        away: boolean;
        sessionIds: Set<string>;
      }
    >();
    for (const [index, viewer] of whiteboardViewers.entries()) {
      const userId = viewer.user.id;
      if (!userId) continue;
      const sessionId =
        viewer.session_id ||
        (viewer as { presence_ref?: string }).presence_ref ||
        `${userId}-${viewer.online_at}-${index}`;
      const existing = byUser.get(userId);
      if (existing) {
        existing.sessionIds.add(sessionId);
        if (!viewer.away) existing.away = false;
      } else {
        byUser.set(userId, {
          user: viewer.user,
          online_at: viewer.online_at,
          away: !!viewer.away,
          sessionIds: new Set([sessionId]),
        });
      }
    }
    return Array.from(byUser.values()).map((v) => ({
      user: v.user,
      online_at: v.online_at,
      away: v.away,
      presenceCount: v.sessionIds.size,
    }));
  }, [whiteboardViewers]);

  // Track whiteboard location in workspace presence
  useEffect(() => {
    if (!wsUpdateLocation) return;
    wsUpdateLocation({ type: 'whiteboard', boardId });

    return () => {
      wsUpdateLocation({ type: 'other' });
    };
  }, [wsUpdateLocation, boardId]);

  const retrySave = useCallback(() => {
    void editorRef.current?.save();
  }, []);

  const loading = (
    <div className="flex h-full w-full items-center justify-center">
      <LoadingIndicator className="h-10 w-10" />
    </div>
  );

  return (
    <div className="absolute inset-0 flex h-screen flex-col">
      <div className="h-17 md:hidden" />
      {/* Toolbar */}
      <div className="pointer-events-auto flex items-center gap-4 border-border border-b bg-background p-4">
        <Link href={`/${wsId}/whiteboards`}>
          <Button variant="ghost" size="sm">
            <ArrowLeftIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
        </Link>

        <WhiteboardTitle wsId={wsId} boardId={boardId} boardName={boardName} />

        {/* Collaboration Status */}
        <div className="flex items-center gap-2">
          <WhiteboardSyncIndicator
            status={status.syncStatus}
            error={status.lastSyncError}
            onRetry={retrySave}
          />

          {/* Connection Status (only when collaboration is enabled) */}
          {realtimeEnabled && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
                    status.isConnected
                      ? 'bg-dynamic-green/10 text-dynamic-green'
                      : 'bg-dynamic-red/10 text-dynamic-red'
                  )}
                >
                  {status.isConnected ? (
                    <WifiIcon className="h-3.5 w-3.5" />
                  ) : (
                    <WifiOffIcon className="h-3.5 w-3.5" />
                  )}
                  <span>{status.isConnected ? 'Live' : 'Offline'}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {status.isConnected
                  ? 'Connected - Changes sync in real-time'
                  : 'Disconnected - Changes will sync when reconnected'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Collaborator Avatars (only when collaboration is enabled) */}
          {realtimeEnabled && (
            <PresenceAvatarList
              viewers={whiteboardViewerEntries}
              currentUserId={currentUserId}
              maxDisplay={5}
              activeLabel={t('on_this_whiteboard')}
            />
          )}
        </div>
      </div>
      <div className="flex-1">
        {resolvedTheme ? (
          <WhiteboardEditor
            ref={editorRef}
            initialData={initialData}
            theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
            persistence={persistence}
            storedSnapshot={storedSnapshot}
            assets={assets}
            collaboration={collaboration}
            viewportStorageKey={`${VIEWPORT_STORAGE_KEY_PREFIX}:${wsId}:${boardId}`}
            onStatusChange={setStatus}
            onNotify={showNotice}
          />
        ) : (
          loading
        )}
      </div>
    </div>
  );
}

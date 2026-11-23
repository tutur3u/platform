'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from '@tuturuuu/icons';
import {
  joinMeetWhiteboard,
  type MeetWhiteboardJoin,
  type MeetWhiteboardRole,
} from '@tuturuuu/internal-api/meet-whiteboard';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { type WhiteboardPresenceMember } from '@tuturuuu/whiteboard';
import { WhiteboardEditor } from '@tuturuuu/whiteboard/react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { BoardError } from './board-error';
import { createBoardSocketTransport } from './socket-transport';

type Connection = 'connecting' | 'live' | 'offline';

/**
 * One linked board: the Excalidraw editor on the room's whiteboard socket.
 * The first ticket comes from the query; later renewals ask the Meet API again,
 * which rechecks access each time.
 */
export function BoardRoom({
  meetingId,
  boardId,
  title,
  onBack,
  onClosed,
}: {
  meetingId: string;
  boardId: string;
  title: string;
  onBack: () => void;
  onClosed: () => void;
}) {
  const t = useTranslations('meet.collaboration');
  const { resolvedTheme } = useTheme();
  const first = useQuery({
    queryKey: ['meeting-whiteboard-session', meetingId, boardId],
    queryFn: () => joinMeetWhiteboard(meetingId, boardId),
    gcTime: 0,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  if (first.error)
    return (
      <BoardError
        error={first.error}
        onRetry={() => void first.refetch()}
        onBack={onBack}
      />
    );
  if (!first.data)
    return (
      <p role="status" className="px-6 py-4 text-muted-foreground text-sm">
        {t('board_connecting')}
      </p>
    );
  return (
    <LiveBoard
      meetingId={meetingId}
      boardId={boardId}
      title={title}
      initial={first.data}
      dark={resolvedTheme === 'dark'}
      onBack={onBack}
      onClosed={onClosed}
    />
  );
}

function LiveBoard({
  meetingId,
  boardId,
  title,
  initial,
  dark,
  onBack,
  onClosed,
}: {
  meetingId: string;
  boardId: string;
  title: string;
  initial: MeetWhiteboardJoin;
  dark: boolean;
  onBack: () => void;
  onClosed: () => void;
}) {
  const t = useTranslations('meet.collaboration');
  const [role, setRole] = useState<MeetWhiteboardRole>(initial.role);
  const [members, setMembers] = useState<WhiteboardPresenceMember[]>([]);
  const [connection, setConnection] = useState<Connection>('connecting');
  const unused = useRef<MeetWhiteboardJoin | null>(initial);
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;
  const transport = useMemo(() => {
    const next = createBoardSocketTransport({
      join: async () => {
        const ready =
          unused.current ?? (await joinMeetWhiteboard(meetingId, boardId));
        unused.current = null;
        return ready;
      },
      onRole: setRole,
      onClosed: () => closedRef.current(),
      onRejected: (reason) =>
        toast.error(
          t(reason === 'unsupported' ? 'board_unsupported' : 'board_full')
        ),
    });
    next.subscribePresence(setMembers);
    return next;
  }, [meetingId, boardId]);
  const user = useMemo(
    () => ({ id: initial.user.id, displayName: initial.user.displayName }),
    [initial.user.id, initial.user.displayName]
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-border border-b px-3 py-2">
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('board_all')}
          title={t('board_all')}
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-0 flex-1 truncate font-medium text-sm">
          {title}
        </span>
        {role === 'view' && (
          <Badge variant="secondary">{t('board_view_only')}</Badge>
        )}
        <span
          role="status"
          className="text-muted-foreground text-xs"
          title={t('board_saved_note')}
        >
          {t(`board_${connection}`)}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <WhiteboardEditor
          theme={dark ? 'dark' : 'light'}
          readOnly={role === 'view'}
          collaboration={{ transport, user, presence: members }}
          onStatusChange={(status) =>
            setConnection(status.isConnected ? 'live' : 'offline')
          }
          fallback={
            <p className="px-6 py-4 text-muted-foreground text-sm">
              {t('board_connecting')}
            </p>
          }
        />
      </div>
    </div>
  );
}

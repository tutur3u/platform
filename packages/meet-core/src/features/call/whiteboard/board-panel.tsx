'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listMeetWhiteboards,
  type MeetWhiteboardGuestAccess,
  updateMeetWhiteboards,
} from '@tuturuuu/internal-api/meet-whiteboard';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { BoardError, boardErrorStatus } from './board-error';
import { BoardManage } from './board-manage';
import { BoardPicker } from './board-picker';
import { BoardRoom } from './board-room';

/**
 * The saved whiteboard activity: pick a linked board, or link and create one
 * when the person is the host or a workspace admin, then draw together.
 */
export function BoardPanel({
  meetingId,
  accountId,
  admitted = true,
}: {
  meetingId: string;
  accountId: string;
  admitted?: boolean;
}) {
  const t = useTranslations('meet.collaboration');
  const client = useQueryClient();
  const key = ['meeting-whiteboards', meetingId, accountId];
  const [activeId, setActiveId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: key,
    queryFn: () => listMeetWhiteboards(meetingId),
    enabled: admitted,
    // The list follows a bounded poll only while it is on screen.
    refetchInterval: activeId ? false : 15_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const change = useMutation({
    mutationFn: (command: Parameters<typeof updateMeetWhiteboards>[1]) =>
      updateMeetWhiteboards(meetingId, command),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: (error) =>
      toast.error(
        t(
          boardErrorStatus(error) === 429
            ? 'board_rate_limited'
            : 'board_action_failed'
        )
      ),
  });
  const active = list.data?.links.find((link) => link.boardId === activeId);
  const leave = () => {
    setActiveId(null);
    void client.invalidateQueries({ queryKey: key });
  };
  if (active)
    return (
      <section className="h-full min-h-0 bg-background">
        <BoardRoom
          meetingId={meetingId}
          boardId={active.boardId}
          title={active.title}
          onBack={leave}
          onClosed={leave}
        />
      </section>
    );
  if (list.error)
    return (
      <BoardError
        error={list.error}
        onRetry={() => void list.refetch()}
        onBack={() => setActiveId(null)}
      />
    );
  if (!list.data)
    return (
      <p role="status" className="px-6 py-4 text-muted-foreground text-sm">
        {t('board_connecting')}
      </p>
    );
  const { links, canManage, available } = list.data;
  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-auto bg-background p-3 sm:p-4">
      <h2 className="font-semibold text-sm">{t('board_list_title')}</h2>
      <BoardPicker
        links={links}
        canManage={canManage}
        pending={change.isPending}
        onOpen={setActiveId}
        onGuestAccess={(boardId, guestAccess) =>
          change.mutate({ action: 'guest-access', boardId, guestAccess })
        }
        onUnlink={(boardId) => change.mutate({ action: 'unlink', boardId })}
      />
      {canManage && (
        <BoardManage
          available={available}
          pending={change.isPending}
          onLink={(boardId, guestAccess: MeetWhiteboardGuestAccess) =>
            change.mutate({ action: 'link', boardId, guestAccess })
          }
          onCreate={(title, guestAccess) =>
            change.mutate(
              { action: 'create', title, guestAccess },
              { onSuccess: (done) => setActiveId(done.boardId) }
            )
          }
        />
      )}
    </section>
  );
}

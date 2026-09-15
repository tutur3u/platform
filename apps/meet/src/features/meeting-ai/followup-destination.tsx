'use client';
import { useQuery } from '@tanstack/react-query';
import { getMeetFollowupContext } from '@tuturuuu/internal-api';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';

export function FollowupDestination({
  workspaceId,
  sourceWsId,
  meetingId,
  boardId,
  listId,
  onBoard,
  onList,
}: {
  workspaceId: string;
  sourceWsId: string;
  meetingId: string;
  boardId: string;
  listId: string;
  onBoard: (id: string) => void;
  onList: (id: string) => void;
}) {
  const t = useTranslations('meet.ai');
  const boards = useQuery({
    queryKey: ['meet-followup-boards', sourceWsId, meetingId, workspaceId],
    queryFn: () => getMeetFollowupContext(sourceWsId, meetingId, workspaceId),
    enabled: !!workspaceId,
    retry: false,
  });
  const lists = useQuery({
    queryKey: [
      'meet-followup-lists',
      sourceWsId,
      meetingId,
      workspaceId,
      boardId,
    ],
    queryFn: () =>
      getMeetFollowupContext(sourceWsId, meetingId, workspaceId, boardId),
    enabled: !!workspaceId && !!boardId,
    retry: false,
  });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="followup-board">{t('followup_board')}</Label>
        <Select
          value={boardId}
          onValueChange={(id) => {
            onBoard(id);
            onList('');
          }}
        >
          <SelectTrigger id="followup-board">
            <SelectValue placeholder={t('followup_choose')} />
          </SelectTrigger>
          <SelectContent>
            {boards.data?.boards.map((board) => (
              <SelectItem key={board.id} value={board.id}>
                {board.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="followup-list">{t('followup_list')}</Label>
        <Select value={listId} onValueChange={onList} disabled={!boardId}>
          <SelectTrigger id="followup-list">
            <SelectValue placeholder={t('followup_choose')} />
          </SelectTrigger>
          <SelectContent>
            {lists.data?.lists
              .filter(
                (list) => list.status !== 'done' && list.status !== 'closed'
              )
              .map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      {(boards.isError || lists.isError) && (
        <p role="alert" className="text-destructive text-sm">
          {t('followup_destination_failed')}
        </p>
      )}
      {boards.data?.boards.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {t('followup_no_boards')}
        </p>
      )}
    </div>
  );
}

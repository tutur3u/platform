'use client';

import { useQuery } from '@tanstack/react-query';
import { History, LoaderCircle } from '@tuturuuu/icons';
import {
  listUserGroupPostCheckLogs,
  type UserGroupPostCheckLogEntry,
} from '@tuturuuu/internal-api/posts';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';

type CheckState = boolean | null;

function stateLabel(t: ReturnType<typeof useTranslations>, state: CheckState) {
  if (state === null) return t('ws_post_details.status_pending');
  return state ? t('common.completed') : t('common.incomplete');
}

function stateBadgeClass(state: CheckState) {
  if (state === null) return 'bg-dynamic-blue/15 text-dynamic-blue';
  return state
    ? 'bg-dynamic-green/15 text-dynamic-green'
    : 'bg-dynamic-red/15 text-dynamic-red';
}

export function PostCheckHistory({
  wsId,
  groupId,
  postId,
  users,
}: {
  wsId: string;
  groupId: string;
  postId: string;
  users: WorkspaceUser[];
}) {
  const t = useTranslations();

  const nameOf = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    return user?.display_name || user?.full_name || user?.email || userId;
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['group-post-check-logs', postId],
    queryFn: () =>
      listUserGroupPostCheckLogs(wsId, groupId, postId).then(
        (response) => response.logs as UserGroupPostCheckLogEntry[]
      ),
    enabled: false,
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button onClick={() => refetch()} size="sm" variant="ghost">
          <History className="mr-1 h-4 w-4" />
          {t('ws_post_details.history')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('ws_post_details.history')}</DialogTitle>
          <DialogDescription>
            {t('ws_post_details.history_description')}
          </DialogDescription>
        </DialogHeader>

        {isLoading || isFetching ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            {t('ws_post_details.history_empty')}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-1 rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">
                    {nameOf(entry.user_id)}
                  </span>
                  <Badge
                    className={stateBadgeClass(entry.previous_is_completed)}
                    variant="outline"
                  >
                    {stateLabel(t, entry.previous_is_completed)}
                  </Badge>
                  <span className="text-muted-foreground text-xs">→</span>
                  <Badge
                    className={stateBadgeClass(entry.new_is_completed)}
                    variant="outline"
                  >
                    {stateLabel(t, entry.new_is_completed)}
                  </Badge>
                </div>
                <span className="text-muted-foreground text-xs">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

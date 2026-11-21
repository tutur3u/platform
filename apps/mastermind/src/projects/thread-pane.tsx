import { ChevronLeft, ExternalLink, Folder, Server } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toneBadge } from '../components/tone';
import { formatAge, useI18n } from '../i18n';
import { ThreadErrorMessage, StaleLine } from './list-states';
import { MessageBubble } from './message-bubble';
import { STATE_TONE, t3ThreadLink, threadErrorOf } from './model';
import { useThreadMessages } from './queries';
import { ReplyComposer } from './reply-composer';

/**
 * The open thread: its header, the transcript newest page first with
 * "Load earlier" above it, and the steered reply composer.
 */
export function ThreadPane({
  environmentId,
  threadId,
  machineLabel,
  now,
  onClose,
}: {
  environmentId?: string;
  threadId: string;
  machineLabel: string;
  now: number;
  /** Shows the list again where it and the thread cannot sit side by side. */
  onClose: () => void;
}) {
  const { t } = useI18n();
  const query = useThreadMessages(environmentId, threadId);
  const code = threadErrorOf(query.error);
  const pages = query.data?.pages ?? [];
  const thread = pages[0]?.thread;
  const messages = [...pages].reverse().flatMap((page) => page.messages);
  const link = t3ThreadLink(environmentId, threadId);

  if (query.isPending)
    return (
      <div
        role="status"
        aria-label={t('state.loading')}
        className="space-y-3 p-4"
      >
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-3/4" />
      </div>
    );
  if (!thread)
    return (
      <ThreadErrorMessage
        code={code ?? 'unavailable'}
        retrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );

  return (
    <div className="flex min-w-0 flex-col">
      <header className="space-y-2 border-b px-4 py-3.5">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 lg:hidden"
          onClick={onClose}
        >
          <ChevronLeft />
          {t('projects.allThreads')}
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="font-semibold text-base">{thread.title}</h2>
          {link ? (
            <Button asChild variant="outline" size="sm">
              <a href={link}>
                <ExternalLink />
                {t('projects.openT3')}
              </a>
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className={toneBadge(STATE_TONE[thread.state])}
          >
            {t(`projects.filter.${thread.state}`)}
          </Badge>
          <Badge variant="outline">
            <Server />
            {machineLabel}
          </Badge>
          <Badge variant="outline">
            <Folder />
            {thread.project ?? t('projects.unassigned')}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {t('projects.updated', {
              age: formatAge(t, now - Date.parse(thread.updatedAt)),
            })}
          </span>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-3 p-4">
        {code ? (
          <StaleLine code={code} updatedAt={query.dataUpdatedAt} now={now} />
        ) : null}
        {query.hasNextPage ? (
          <Button
            variant="ghost"
            size="sm"
            className="self-center text-muted-foreground"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t('projects.loadEarlier')}
          </Button>
        ) : (
          <p className="self-center text-muted-foreground text-xs">
            {t('projects.start')}
          </p>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.position} message={message} />
        ))}
        <ReplyComposer environmentId={environmentId} threadId={threadId} />
      </div>
    </div>
  );
}

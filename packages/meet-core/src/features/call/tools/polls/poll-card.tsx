'use client';

import {
  Download,
  Eye,
  EyeOff,
  Play,
  Sparkles,
  Square,
  Trash2,
  X,
} from '@tuturuuu/icons';
import type { ProjectedPoll } from '@tuturuuu/realtime/meet/room-polls';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { pollExportUrl } from '../../lib/polls-client';
import type { PollAction } from '../../server/polls';
import { ToolAction, toolActionClass } from '../tool-ui';
import { PollBallot } from './poll-ballot';
import { PollResults } from './poll-results';

export function PollCard({
  poll,
  meetingId,
  busy,
  canManage,
  onAction,
  locale,
  summary,
}: {
  poll: ProjectedPoll;
  meetingId: string;
  busy: boolean;
  canManage: boolean;
  onAction: (action: PollAction) => void;
  locale: 'en' | 'vi';
  summary?: string;
}) {
  const t = useTranslations('meet.call.polls');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { id: pollId } = poll;
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-sm">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={poll.status === 'active' ? 'default' : 'secondary'}>
            {t(poll.status)}
          </Badge>
          <Badge variant="outline">{t(poll.type)}</Badge>
          {poll.anonymous && <Badge variant="outline">{t('anonymous')}</Badge>}
        </div>
        <h3 className="wrap-break-word font-semibold text-base text-foreground">
          {poll.question}
        </h3>
      </div>
      {poll.status !== 'closed' && (
        <PollBallot
          key={JSON.stringify(poll.myResponse)}
          poll={poll}
          busy={busy}
          onVote={(response) => onAction({ action: 'vote', pollId, response })}
        />
      )}
      {poll.myResponse && (
        <p role="status" className="text-muted-foreground">
          {t('recorded')}
        </p>
      )}
      {poll.status !== 'draft' &&
        (poll.results ? (
          <PollResults results={poll.results} />
        ) : (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <EyeOff className="size-4" />
            {t('results_hidden')}
          </p>
        ))}
      {summary && (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3"
        >
          <p className="flex items-center gap-1.5 font-medium">
            <Sparkles className="size-4" />
            {t('mira_summary')}
          </p>
          <p className="wrap-break-word whitespace-pre-wrap">{summary}</p>
        </div>
      )}
      {canManage && !confirmDelete && (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {poll.status === 'draft' && (
            <ToolAction
              variant="default"
              icon={Play}
              label={t('launch')}
              disabled={busy}
              onClick={() => onAction({ action: 'launch', pollId })}
            />
          )}
          {poll.status === 'active' && (
            <>
              <ToolAction
                icon={poll.resultsVisible ? EyeOff : Eye}
                label={t(poll.resultsVisible ? 'hide' : 'show')}
                disabled={busy}
                onClick={() =>
                  onAction({
                    action: 'visibility',
                    pollId,
                    resultsVisible: !poll.resultsVisible,
                  })
                }
              />
              <ToolAction
                icon={Square}
                label={t('close_poll')}
                disabled={busy}
                onClick={() => onAction({ action: 'close', pollId })}
              />
            </>
          )}
          {poll.status !== 'draft' && (
            <ToolAction
              icon={Sparkles}
              label={t('mira_summarize')}
              disabled={busy}
              onClick={() =>
                onAction({ action: 'mira_summarize', pollId, locale })
              }
            />
          )}
          {(['csv', 'json'] as const).map((format) => (
            <Button
              asChild
              key={format}
              size="sm"
              variant="ghost"
              className={toolActionClass}
            >
              <a download href={pollExportUrl(meetingId, pollId, format)}>
                <Download className="size-4" />
                {t(format)}
              </a>
            </Button>
          ))}
          <ToolAction
            icon={Trash2}
            label={t('delete')}
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          />
        </div>
      )}
      {canManage && confirmDelete && (
        <div className="flex flex-col gap-3 border-t pt-3">
          <p>{t('confirm_delete')}</p>
          <div className="flex flex-wrap gap-2">
            <ToolAction
              variant="destructive"
              icon={Trash2}
              label={t('delete')}
              disabled={busy}
              onClick={() => onAction({ action: 'delete', pollId })}
            />
            <ToolAction
              variant="ghost"
              icon={X}
              label={t('cancel')}
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
            />
          </div>
        </div>
      )}
    </article>
  );
}

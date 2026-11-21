'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChartColumn, RotateCcw } from '@tuturuuu/icons';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ResizableCallPanel } from '../../components/resizable-call-panel';
import {
  notifyPollMutation,
  type PollActionResult,
  pollsKey,
  sendPollAction,
  useCallPolls,
} from '../../lib/polls-client';
import type { PollAction } from '../../server/polls';
import { useMeetTool } from '../context';
import { CallPanelHeader, ToolAction } from '../tool-ui';
import { PollCard } from './poll-card';
import { PollComposer } from './poll-composer';

export function PollsToolPanel() {
  const { meetingId, accountId, enabled, close } = useMeetTool();
  const query = useCallPolls(meetingId, accountId, enabled, true);
  const t = useTranslations('meet.call.polls');
  const locale = useLocale() === 'vi' ? 'vi' : 'en';
  const queryClient = useQueryClient();
  const [draftFallback, setDraftFallback] = useState(false);
  const [summary, setSummary] = useState<{ pollId: string; text: string }>();
  const mutation = useMutation<PollActionResult, Error, PollAction>({
    mutationFn: (action) => sendPollAction(meetingId, action),
    onMutate: (action) => {
      setDraftFallback(false);
      if (action.action === 'mira_summarize') setSummary(undefined);
    },
    onSuccess: (result, action) => {
      if (action.action === 'mira_summarize') {
        setSummary({
          pollId: action.pollId,
          text:
            result.summary ??
            (result.responseCount === 0
              ? t('no_responses')
              : t('summary_fallback')),
        });
        return;
      }
      if (action.action === 'mira_draft') setDraftFallback(!!result.fallback);
      notifyPollMutation(meetingId);
      return queryClient.invalidateQueries({
        queryKey: pollsKey(meetingId, accountId),
      });
    },
  });
  const polls = query.data?.polls ?? [];
  const canManage = query.data?.canManage ?? false;
  const busy = mutation.isPending;

  return (
    <ResizableCallPanel label={t('title')}>
      <CallPanelHeader
        icon={ChartColumn}
        title={t('title')}
        closeLabel={t('close_panel')}
        onClose={close}
      />
      <div
        aria-busy={busy}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        {query.isPending && (
          <p role="status" className="text-muted-foreground text-sm">
            {t('loading')}
          </p>
        )}
        {query.isError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 text-sm"
          >
            {t('load_error')}
            <ToolAction
              icon={RotateCcw}
              label={t('retry')}
              busy={query.isFetching}
              onClick={() => void query.refetch()}
            />
          </div>
        )}
        {mutation.isError && (
          <p role="alert" className="text-destructive text-sm">
            {t('action_error')}
          </p>
        )}
        {draftFallback && (
          <p role="status" className="text-muted-foreground text-sm">
            {t('draft_fallback')}
          </p>
        )}
        {canManage && (
          <PollComposer
            busy={busy}
            locale={locale}
            onSubmit={mutation.mutateAsync}
          />
        )}
        {query.isSuccess && polls.length === 0 && (
          <p className="py-6 text-center text-muted-foreground text-sm">
            {t('empty')}
          </p>
        )}
        {polls.toReversed().map((poll) => (
          <PollCard
            key={poll.id}
            poll={poll}
            busy={busy}
            canManage={canManage}
            meetingId={meetingId}
            onAction={mutation.mutate}
            locale={locale}
            summary={summary?.pollId === poll.id ? summary.text : undefined}
          />
        ))}
      </div>
    </ResizableCallPanel>
  );
}

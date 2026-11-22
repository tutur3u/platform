'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChartColumn, Sparkles, X } from '@tuturuuu/icons';
import {
  type PollDefinition,
  type PollResponse,
  type ProjectedPoll,
  pollDefinitionSchema,
} from '@tuturuuu/realtime/meet/room-polls';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import {
  notifyPollMutation,
  type PollActionResult,
  pollExportUrl,
  pollsKey,
  sendPollAction,
  type useCallPolls,
} from '../lib/polls-client';
import type { PollAction } from '../server/polls';
import { MiraAdultNotice } from '../../live-assistant/mira-adult-notice';
import { PollResultList } from './poll-result-list';
import { ControlButton } from './control-bar';
import { ResizableCallPanel } from './resizable-call-panel';

const types = [
  'single_choice',
  'multiple_choice',
  'rating',
  'word_cloud',
  'open_text',
] as const;
const selectClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-foreground text-sm focus-visible:outline-2 focus-visible:outline-ring';
type PollQuery = ReturnType<typeof useCallPolls>;
export function PollsControl({
  query,
  open,
  onClick,
}: {
  query: PollQuery;
  open: boolean;
  onClick: () => void;
}) {
  const t = useTranslations('meet.call.polls');
  const isActive = (poll: ProjectedPoll) => poll.status === 'active';
  const count = query.data?.polls.filter(isActive).length ?? 0;
  return (
    <ControlButton
      active={open}
      badge={count}
      icon={ChartColumn}
      label={count ? t('active_indicator', { count }) : t('title')}
      onClick={onClick}
    />
  );
}

export function PollsPanel({
  accountId,
  meetingId,
  query,
  onClose,
}: {
  accountId: string;
  meetingId: string;
  query: PollQuery;
  onClose: () => void;
}) {
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
      <header className="flex items-center justify-between gap-2 border-border border-b px-3 py-2">
        <h2 className="font-semibold text-foreground">{t('title')}</h2>
        <Button
          aria-label={t('close_panel')}
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </header>
      <div aria-busy={busy} className="min-h-0 space-y-3 overflow-y-auto p-3">
        {query.isPending && <p role="status">{t('loading')}</p>}
        {query.isError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 text-sm"
          >
            {t('load_error')}
            <Button
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              size="sm"
              variant="outline"
            >
              {t('retry')}
            </Button>
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
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
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

function PollComposer({
  busy,
  locale,
  onSubmit,
}: {
  busy: boolean;
  locale: 'en' | 'vi';
  onSubmit: (action: PollAction) => Promise<unknown>;
}) {
  const t = useTranslations('meet.call.polls');
  const adultNoticeId = useId();
  const [mode, setMode] = useState<'manual' | 'mira'>();
  const [type, setType] = useState<PollDefinition['type']>('single_choice');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState('');
  const [limit, setLimit] = useState(2);
  const [scale, setScale] = useState(5);
  const [anonymous, setAnonymous] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const labels = options
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const choiceFields =
      type === 'single_choice'
        ? { options: labels }
        : type === 'multiple_choice'
          ? { options: labels, maxChoices: limit }
          : type === 'rating'
            ? { min: 1, max: scale }
            : {};
    const definition = pollDefinitionSchema.safeParse({
      type,
      question,
      ...choiceFields,
    });
    if (mode === 'mira' ? !question.trim() : !definition.success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    try {
      if (mode === 'mira')
        await onSubmit({
          action: 'mira_draft',
          prompt: question,
          anonymous,
          locale,
        });
      else if (definition.success)
        await onSubmit({
          action: 'create',
          definition: definition.data,
          anonymous,
        });
      setMode(undefined);
      setQuestion('');
      setOptions('');
    } catch {
      // The mutation retains the error and the form retains the inputs.
    }
  };
  if (!mode)
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setMode('manual')}
        >
          {t('new_poll')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          aria-describedby={adultNoticeId}
          onClick={() => setMode('mira')}
        >
          <Sparkles className="size-4" /> {t('mira_draft')}
          <MiraAdultNotice variant="compact" id={adultNoticeId} />
        </Button>
      </div>
    );

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-border bg-muted/40 p-3 text-sm"
    >
      {mode === 'manual' && (
        <label className="grid gap-1 font-medium">
          {t('format')}
          <select
            className={selectClass}
            value={type}
            onChange={(event) => {
              const selected = types.find(
                (value) => value === event.target.value
              );
              if (selected) setType(selected);
            }}
          >
            {types.map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="grid gap-1 font-medium">
        {t(mode === 'manual' ? 'question' : 'mira_topic')}
        <Textarea
          autoFocus
          maxLength={mode === 'manual' ? 240 : 600}
          required
          rows={2}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
      </label>
      {mode === 'manual' &&
        (type === 'single_choice' || type === 'multiple_choice') && (
          <label className="grid gap-1 font-medium">
            {t('options')}
            <Textarea
              maxLength={1210}
              required
              rows={3}
              value={options}
              onChange={(event) => setOptions(event.target.value)}
            />
          </label>
        )}
      {mode === 'manual' && type === 'multiple_choice' && (
        <label className="grid gap-1 font-medium">
          {t('max_choices')}
          <Input
            type="number"
            min={1}
            max={10}
            required
            value={limit || ''}
            onChange={(event) => setLimit(Number(event.target.value))}
          />
        </label>
      )}
      {mode === 'manual' && type === 'rating' && (
        <label className="grid gap-1 font-medium">
          {t('scale')}
          <select
            className={selectClass}
            value={scale}
            onChange={(event) => setScale(Number(event.target.value))}
          >
            <option value={5}>{t('range', { min: 1, max: 5 })}</option>
            <option value={10}>{t('range', { min: 1, max: 10 })}</option>
          </select>
        </label>
      )}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(event) => setAnonymous(event.target.checked)}
        />
        {t('anonymous')}
      </label>
      {invalid && (
        <p role="alert" className="text-destructive">
          {t('invalid')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {mode === 'mira' && (
          <MiraAdultNotice id={adultNoticeId} className="basis-full" />
        )}
        <Button
          type="submit"
          size="sm"
          disabled={busy}
          aria-describedby={mode === 'mira' ? adultNoticeId : undefined}
        >
          {t('save_draft')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => setMode(undefined)}
        >
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}

function PollCard({
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
  const adultNoticeId = useId();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { id: pollId } = poll;
  return (
    <article className="space-y-3 rounded-lg border border-border p-3 text-sm">
      <div>
        <h3 className="wrap-break-word font-semibold text-foreground">
          {poll.question}
        </h3>
        <p className="text-muted-foreground">
          {t(poll.status)} · {t(poll.type)}
          {poll.anonymous ? ` · ${t('anonymous')}` : ''}
        </p>
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
          <PollResultList results={poll.results} />
        ) : (
          <p className="text-muted-foreground">{t('hidden')}</p>
        ))}
      {summary && (
        <div role="status" className="space-y-1 rounded-md bg-muted/40 p-2">
          <p className="font-medium">{t('mira_summary')}</p>
          <p className="wrap-break-word whitespace-pre-wrap">{summary}</p>
        </div>
      )}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {poll.status === 'draft' && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => onAction({ action: 'launch', pollId })}
            >
              {t('launch')}
            </Button>
          )}
          {poll.status === 'active' && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  onAction({
                    action: 'visibility',
                    pollId,
                    resultsVisible: !poll.resultsVisible,
                  })
                }
              >
                {t(poll.resultsVisible ? 'hide' : 'show')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onAction({ action: 'close', pollId })}
              >
                {t('close_poll')}
              </Button>
            </>
          )}
          {poll.status !== 'draft' && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              aria-describedby={adultNoticeId}
              onClick={() =>
                onAction({ action: 'mira_summarize', pollId, locale })
              }
            >
              <Sparkles className="size-4" /> {t('mira_summarize')}
              <MiraAdultNotice variant="compact" id={adultNoticeId} />
            </Button>
          )}
          {(['csv', 'json'] as const).map((format) => (
            <Button asChild key={format} size="sm" variant="ghost">
              <a download href={pollExportUrl(meetingId, pollId, format)}>
                {t(format)}
              </a>
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            {t('delete')}
          </Button>
        </div>
      )}
      {canManage && confirmDelete && (
        <div className="space-y-2 border-border border-t pt-2">
          <p>{t('confirm_delete')}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => onAction({ action: 'delete', pollId })}
            >
              {t('delete')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

function PollBallot({
  poll,
  busy,
  onVote,
}: {
  poll: ProjectedPoll;
  busy: boolean;
  onVote: (response: PollResponse) => void;
}) {
  const t = useTranslations('meet.call.polls');
  const draft = poll.status === 'draft';
  const [response, setResponse] = useState<PollResponse | null>(
    poll.myResponse
  );
  const selected =
    response?.type === 'multiple_choice'
      ? response.optionIds
      : response?.type === 'single_choice'
        ? [response.optionId]
        : [];
  const text = response && 'text' in response ? response.text : '';
  const valid =
    response &&
    (response.type === 'multiple_choice'
      ? selected.length > 0
      : 'text' in response
        ? text.trim().length > 0
        : true);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft && response && valid) onVote(response);
      }}
    >
      <fieldset disabled={busy || draft} className="min-w-0 space-y-2">
        <legend className="sr-only">{poll.question}</legend>
        {'options' in poll && (
          <>
            {poll.type === 'multiple_choice' && (
              <p className="text-muted-foreground">
                {t('choose_limit', { count: poll.maxChoices })}
              </p>
            )}
            {poll.options.map(({ id, label }) => (
              <label key={id} className="flex min-w-0 items-start gap-2">
                <input
                  type={poll.type === 'single_choice' ? 'radio' : 'checkbox'}
                  name={poll.id}
                  checked={selected.includes(id)}
                  disabled={
                    poll.type === 'multiple_choice' &&
                    selected.length >= poll.maxChoices &&
                    !selected.includes(id)
                  }
                  onChange={() =>
                    setResponse(
                      poll.type === 'single_choice'
                        ? { type: poll.type, optionId: id }
                        : {
                            type: poll.type,
                            optionIds: selected.includes(id)
                              ? selected.filter((value) => value !== id)
                              : [...selected, id],
                          }
                    )
                  }
                />
                <span className="min-w-0 wrap-break-word">{label}</span>
              </label>
            ))}
          </>
        )}
        {poll.type === 'rating' && (
          <div className="flex flex-wrap gap-2">
            {Array.from(
              { length: poll.max - poll.min + 1 },
              (_, index) => index + poll.min
            ).map((rating) => (
              <label key={rating} className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name={poll.id}
                  checked={
                    response?.type === 'rating' && response.rating === rating
                  }
                  onChange={() => setResponse({ type: 'rating', rating })}
                />
                {rating}
              </label>
            ))}
          </div>
        )}
        {!draft &&
          (poll.type === 'word_cloud' || poll.type === 'open_text') && (
            <label className="grid gap-1">
              {t('your_answer')}
              {poll.type === 'word_cloud' ? (
                <Input
                  value={text}
                  maxLength={60}
                  onChange={(event) =>
                    setResponse({
                      type: 'word_cloud',
                      text: event.target.value,
                    })
                  }
                />
              ) : (
                <Textarea
                  value={text}
                  rows={3}
                  maxLength={500}
                  onChange={(event) =>
                    setResponse({ type: 'open_text', text: event.target.value })
                  }
                />
              )}
            </label>
          )}
        {!draft && (
          <Button size="sm" type="submit" disabled={!valid || busy}>
            {t(poll.myResponse ? 'update_vote' : 'vote')}
          </Button>
        )}
      </fieldset>
    </form>
  );
}

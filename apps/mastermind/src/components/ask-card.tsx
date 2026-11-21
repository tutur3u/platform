import { Send } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { useAnswer } from '../fleet/answer';
import type { InboxItem } from '../fleet/model';
import { setSnooze } from '../fleet/snooze';
import { formatTime, useI18n } from '../i18n';
import { Due, UrgencyBadge } from './ask-meta';
import { AnswerOutcome, ReceiptLine } from './ask-outcome';
import { Facts } from './section';
import { SnoozeMenu } from './snooze-menu';

/**
 * One ask: numbered options with the recommended one filled, and a typed
 * reply steered to the asking lane. `onAnswered` moves focus to the next
 * card ("send and next").
 */
export function AskCard({
  item,
  now,
  interactive,
  onAnswered,
}: {
  item: InboxItem;
  now: number;
  /** False while the snapshot is stale from a failed refresh. */
  interactive: boolean;
  onAnswered?: () => void;
}) {
  const { t, locale } = useI18n();
  const { decision, receipt, snoozedUntil } = item;
  const answer = useAnswer(decision.id);
  const { state } = answer;
  const [draft, setDraft] = useState('');
  const options = [...decision.options].sort(
    (a, b) =>
      Number(b.id === decision.recommendedOptionId) -
      Number(a.id === decision.recommendedOptionId)
  );
  const actionable = interactive && !receipt && state.kind === 'idle';
  const choose = (input: Parameters<typeof answer.queue>[0], next = true) => {
    answer.queue(input);
    if (next) onAnswered?.();
  };
  const sendReply = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    choose({ action: 'reply', text });
  };

  return (
    <Card
      data-inbox-card
      tabIndex={-1}
      className={cn(
        'focus-visible:outline-2 focus-visible:outline-ring',
        !actionable && 'bg-muted/50'
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <UrgencyBadge urgency={decision.urgency} />
            {decision.requester && (
              <span className="text-muted-foreground text-sm">
                {decision.requester}
              </span>
            )}
          </div>
          <Due deadlineAt={decision.deadlineAt} now={now} />
        </div>
        <h4 className="font-semibold">{decision.title}</h4>
        {decision.body && (
          <p className="text-muted-foreground text-sm">{decision.body}</p>
        )}
        <Facts
          rows={[
            [t('ask.whyNow'), decision.why],
            [t('ask.default'), decision.defaultOutcome],
          ]}
        />
        {receipt && state.kind === 'idle' && <ReceiptLine receipt={receipt} />}
        {snoozedUntil && (
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
            {t('ask.snoozedUntil', { time: formatTime(locale, snoozedUntil) })}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSnooze(decision.id, null)}
            >
              {t('ask.unsnooze')}
            </Button>
          </div>
        )}
        {actionable && (
          <div className="flex flex-wrap gap-2">
            {options.map((option, index) => {
              const recommended = option.id === decision.recommendedOptionId;
              return (
                <Button
                  key={option.id}
                  size="sm"
                  data-option={index + 1}
                  variant={recommended ? 'default' : 'outline'}
                  onClick={() =>
                    choose({ action: 'approve', optionId: option.id })
                  }
                >
                  <span className="font-mono text-xs opacity-70">
                    {index + 1}
                  </span>
                  {option.label}
                  {recommended && (
                    <span className="font-normal text-xs opacity-70">
                      {t('ask.recommended')}
                    </span>
                  )}
                </Button>
              );
            })}
            {!options.length && (
              <Button
                size="sm"
                data-option={1}
                onClick={() => choose({ action: 'approve' })}
              >
                <span className="font-mono text-xs opacity-70">1</span>
                {t('ask.approve')}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => choose({ action: 'hold' })}
            >
              {t('ask.hold')}
            </Button>
            {!snoozedUntil && (
              <SnoozeMenu
                decisionId={decision.id}
                deadlineAt={decision.deadlineAt}
              />
            )}
          </div>
        )}
        {actionable && (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              sendReply();
            }}
          >
            <Input
              data-reply
              aria-label={t('ask.reply')}
              placeholder={t('ask.replyInline')}
              maxLength={2000}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  sendReply();
                }
              }}
            />
            <Button type="submit" variant="secondary" disabled={!draft.trim()}>
              <Send />
              {t('ask.sendNext')}
            </Button>
          </form>
        )}
        {state.kind !== 'idle' && state.kind !== 'replying' && (
          <AnswerOutcome
            state={state}
            now={now}
            onUndo={answer.undo}
            onCheck={() => void answer.check()}
            onRetry={answer.retryNow}
          />
        )}
      </CardContent>
    </Card>
  );
}

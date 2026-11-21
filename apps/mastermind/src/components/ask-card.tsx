import { Check, Clock, MessageSquare } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useAnswer } from '../fleet/answer';
import type { InboxItem } from '../fleet/model';
import { formatRemaining, tierOf } from '../fleet/model';
import { setSnooze } from '../fleet/snooze';
import { formatTime, useI18n } from '../i18n';
import { AnswerOutcome, ReceiptLine } from './ask-outcome';
import { Facts } from './section';
import { SnoozeMenu } from './snooze-menu';
import { toneBadge } from './tone';

const DUE_TONE = { urgent: 'red', decide: 'orange', fyi: 'gray' } as const;

function Due({
  deadlineAt,
  now,
  tier,
}: {
  deadlineAt?: string;
  now: number;
  tier: keyof typeof DUE_TONE;
}) {
  const { t } = useI18n();
  if (!deadlineAt) return null;
  const left = Date.parse(deadlineAt) - now;
  return (
    <Badge
      variant="outline"
      className={toneBadge(left > 0 ? DUE_TONE[tier] : 'gray')}
    >
      <Clock />
      <span className="tabular-nums">
        {left > 0
          ? t('ask.due', { time: formatRemaining(left) })
          : t('ask.overdue')}
      </span>
    </Badge>
  );
}

export function AskCard({
  item,
  now,
  interactive,
}: {
  item: InboxItem;
  now: number;
  /** False while the snapshot is stale from a failed refresh. */
  interactive: boolean;
}) {
  const { t, locale } = useI18n();
  const { decision, receipt, snoozedUntil } = item;
  const answer = useAnswer(decision.id);
  const { state } = answer;
  const tier = tierOf(decision);
  const recommended = decision.options.find(
    (option) => option.id === decision.recommendedOptionId
  );
  const others = decision.options.filter((option) => option !== recommended);
  const actionable =
    interactive &&
    !receipt &&
    (state.kind === 'idle' || state.kind === 'replying');

  return (
    <Card className={cn(!actionable && 'bg-muted/50')}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h4 className="min-w-0 flex-1 font-semibold">{decision.title}</h4>
          <Due deadlineAt={decision.deadlineAt} now={now} tier={tier} />
        </div>
        {decision.body && (
          <p className="text-muted-foreground text-sm">{decision.body}</p>
        )}
        <Facts
          rows={[
            [t('ask.why'), decision.why],
            [t('ask.default'), decision.defaultOutcome],
            [t('ask.from'), decision.requester],
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
        {actionable && tier !== 'fyi' && (
          <div className="flex flex-wrap gap-2">
            {recommended && (
              <Button
                onClick={() =>
                  answer.queue({ action: 'approve', optionId: recommended.id })
                }
              >
                <Check />
                {recommended.label}
                <span className="font-normal text-xs opacity-70">
                  {t('ask.recommended')}
                </span>
              </Button>
            )}
            {others.map((option) => (
              <Button
                key={option.id}
                variant="outline"
                onClick={() =>
                  answer.queue({ action: 'approve', optionId: option.id })
                }
              >
                {option.label}
              </Button>
            ))}
            {!decision.options.length && (
              <Button onClick={() => answer.queue({ action: 'approve' })}>
                <Check />
                {t('ask.approve')}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => answer.queue({ action: 'hold' })}
            >
              {t('ask.hold')}
            </Button>
            <Button
              variant="ghost"
              onClick={answer.reply}
              aria-expanded={state.kind === 'replying'}
            >
              <MessageSquare />
              {t('ask.reply')}
            </Button>
            {!snoozedUntil && (
              <SnoozeMenu
                decisionId={decision.id}
                deadlineAt={decision.deadlineAt}
              />
            )}
          </div>
        )}
        {actionable && state.kind === 'replying' && (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              const text = state.draft.trim();
              if (text) answer.queue({ action: 'reply', text });
            }}
          >
            <Textarea
              autoFocus
              aria-label={t('ask.reply')}
              placeholder={t('ask.replyPlaceholder')}
              maxLength={2000}
              value={state.draft}
              onChange={(event) => answer.draft(event.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={!state.draft.trim()}>
                {t('ask.send')}
              </Button>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={answer.cancel}
              >
                {t('ask.cancel')}
              </Button>
            </div>
          </form>
        )}
        {state.kind !== 'idle' && state.kind !== 'replying' && (
          <AnswerOutcome
            state={state}
            now={now}
            onUndo={answer.undo}
            onCheck={() => void answer.check()}
          />
        )}
      </CardContent>
    </Card>
  );
}

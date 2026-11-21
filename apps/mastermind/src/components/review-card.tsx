import { useQuery } from '@tanstack/react-query';
import { Check, ExternalLink, ImageOff, PencilLine } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useAnswer } from '../fleet/answer';
import type { FleetDecision, FleetReview } from '../fleet/contract';
import type { InboxItem } from '../fleet/model';
import { loadReviewPreview } from '../fleet/server';
import { useI18n } from '../i18n';
import { AnswerOutcome, ReceiptLine } from './ask-outcome';
import { Facts } from './section';
import { toneBadge } from './tone';

function Preview({
  decision,
  review,
}: {
  decision: FleetDecision;
  review: FleetReview;
}) {
  const { t } = useI18n();
  const preview = review.preview;
  // Keyed by the image itself, so a new upload for the same review refetches.
  const source =
    preview?.source === 'asset' ? preview.assetId : (preview?.url ?? '');
  const query = useQuery({
    queryKey: ['fleet', 'review-preview', decision.id, source],
    queryFn: () => loadReviewPreview({ data: { decisionId: decision.id } }),
    enabled: !!preview,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
  if (!preview) return null;
  const frame =
    'block aspect-video w-full overflow-hidden rounded-lg border bg-muted';
  if (query.isPending) return <Skeleton className={frame} />;
  if (!query.data)
    return (
      <div
        className={cn(
          frame,
          'grid place-items-center text-muted-foreground text-sm'
        )}
      >
        <span className="flex items-center gap-2">
          <ImageOff className="size-4" />
          {t('review.noPreview')}
        </span>
      </div>
    );
  return (
    <a
      href={review.mockupUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        frame,
        'focus-visible:outline-2 focus-visible:outline-ring'
      )}
    >
      <img
        src={query.data}
        alt={t('review.previewAlt', { title: decision.title })}
        className="size-full object-cover object-top"
      />
    </a>
  );
}

/** A design review: preview, the full mockup, Approve or Request changes. */
export function ReviewCard({
  item,
  interactive,
  now,
  onAnswered,
}: {
  item: InboxItem;
  interactive: boolean;
  now: number;
  /** Moves focus to the next card once an answer is queued. */
  onAnswered?: () => void;
}) {
  const { t } = useI18n();
  const { decision, receipt } = item;
  const review = decision.review;
  const answer = useAnswer(decision.id);
  const { state } = answer;
  if (!review) return null;
  const actionable =
    interactive &&
    !receipt &&
    (state.kind === 'idle' || state.kind === 'replying');
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
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={toneBadge('blue')}>
            {t('review.badge')}
          </Badge>
          {decision.requester && (
            <span className="text-muted-foreground text-sm">
              {decision.requester}
            </span>
          )}
        </div>
        <h4 className="font-semibold">{decision.title}</h4>
        <Facts rows={[[t('ask.why'), decision.why ?? decision.body]]} />
        <Preview decision={decision} review={review} />
        <Button variant="outline" size="sm" asChild>
          <a href={review.mockupUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            {t('review.open')}
          </a>
        </Button>
        {receipt && state.kind === 'idle' && <ReceiptLine receipt={receipt} />}
        {actionable && state.kind === 'idle' && (
          <div className="flex flex-wrap gap-2">
            <Button
              data-option="1"
              onClick={() => {
                answer.queue({ action: 'approve' });
                onAnswered?.();
              }}
            >
              <Check />
              {t('review.approve')}
            </Button>
            <Button data-option="2" variant="outline" onClick={answer.reply}>
              <PencilLine />
              {t('review.requestChanges')}
            </Button>
          </div>
        )}
        {actionable && state.kind === 'replying' && (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              const text = state.draft.trim();
              if (!text) return;
              answer.queue({ action: 'request_changes', text });
              onAnswered?.();
            }}
          >
            <Textarea
              autoFocus
              aria-label={t('review.requestChanges')}
              placeholder={t('review.notes')}
              maxLength={2000}
              value={state.draft}
              onChange={(event) => answer.draft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={!state.draft.trim()}>
                {t('review.send')}
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
            onRetry={answer.retryNow}
          />
        )}
      </CardContent>
    </Card>
  );
}

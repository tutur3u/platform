'use client';
import { Check, ShieldCheck, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AssistantToolPreview } from '../call/components/assistant-tool-preview';
import type { LiveAssistantEvent } from './contracts';

type Review = Extract<LiveAssistantEvent, { type: 'review' }>;
export function LiveReviewCard({
  review,
  ready,
  decide,
}: {
  review: Review;
  ready: boolean;
  decide: (review: Review, approved: boolean, text?: string) => Promise<void>;
}) {
  const t = useTranslations('meet.live');
  const [text, setText] = useState(review.text);
  const label =
    review.action === 'workspace'
      ? 'review_workspace'
      : review.action === 'remember'
        ? 'review_memory'
        : 'review_share';
  return (
    <section
      className="space-y-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-4"
      aria-label={t(label)}
    >
      <div className="flex items-center gap-2 font-medium">
        <ShieldCheck className="size-5" />
        {t(label)}
      </div>
      {review.status === 'pending' && review.action !== 'workspace' ? (
        <Textarea
          aria-label={t('review_text')}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={review.action === 'remember' ? 1000 : 4000}
        />
      ) : (
        <p className="whitespace-pre-wrap rounded-lg bg-background p-3 text-sm">
          {review.text}
        </p>
      )}
      {review.action === 'workspace' && (
        <AssistantToolPreview
          input={review.args}
          timezone={review.timezone ?? 'UTC'}
        />
      )}
      {review.status === 'pending' ? (
        <div className="flex gap-2">
          <Button
            disabled={!ready || !text.trim()}
            onClick={() => void decide(review, true, text)}
          >
            <Check className="size-4" />
            {t('approve')}
          </Button>
          <Button
            variant="outline"
            disabled={!ready}
            onClick={() => void decide(review, false)}
          >
            <X className="size-4" />
            {t('deny')}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary">{t(review.status)}</Badge>
          {review.status === 'failed' && (
            <Button
              variant="outline"
              disabled={!ready}
              onClick={() => void decide(review, false)}
            >
              <X className="size-4" />
              {t('discard')}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

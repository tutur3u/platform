'use client';

import type { MeetLiveActivityDraftResult } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';

export function MiraActivityDraftPreview({
  draft,
}: {
  draft: MeetLiveActivityDraftResult;
}) {
  const t = useTranslations('meet.call.live_activities.mira_draft');

  return (
    <div
      data-testid="mira-draft-preview"
      className="max-h-56 space-y-2 overflow-y-auto rounded-xl border bg-muted/30 p-3 text-sm"
    >
      <p className="font-semibold text-muted-foreground text-xs">
        {t('preview_label')}
      </p>
      {draft.kind === 'flashcards' && (
        <div className="space-y-2">
          <p className="font-semibold">{draft.title}</p>
          <ol className="space-y-1.5">
            {draft.cards.map(
              (card: { front: string; back: string }, index: number) => (
                <li
                  key={`${card.front}:${index}`}
                  className="rounded-lg border bg-card px-2.5 py-1.5"
                >
                  <p className="font-medium text-xs">{card.front}</p>
                  <p className="text-muted-foreground text-xs">{card.back}</p>
                </li>
              )
            )}
          </ol>
        </div>
      )}
      {draft.kind === 'game' && (
        <ol className="space-y-1.5">
          {draft.rounds.map(
            (
              round: {
                prompt: string;
                options: string[];
                answer: number;
                seconds: number;
              },
              index: number
            ) => (
              <li
                key={`${round.prompt}:${index}`}
                className="rounded-lg border bg-card px-2.5 py-1.5"
              >
                <p className="font-medium text-xs">
                  {index + 1}. {round.prompt}
                </p>
                <p className="text-muted-foreground text-xs">
                  {round.options.join(' · ')}
                </p>
              </li>
            )
          )}
        </ol>
      )}
      {draft.kind === 'icebreaker' && (
        <div className="space-y-2">
          <p className="font-medium">{draft.prompt}</p>
          {draft.starters.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {draft.starters.map((starter: string, index: number) => (
                <Badge key={`${starter}:${index}`} variant="secondary">
                  {starter}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
      {draft.kind === 'assessment' && (
        <div className="space-y-2">
          <p className="font-semibold">{draft.title}</p>
          <ol className="space-y-1.5">
            {draft.items.map(
              (
                item: {
                  prompt: string;
                  kind: 'short' | 'long' | 'choice';
                  options: string[];
                  answer?: number;
                },
                index: number
              ) => (
                <li
                  key={`${item.prompt}:${index}`}
                  className="rounded-lg border bg-card px-2.5 py-1.5"
                >
                  <p className="font-medium text-xs">
                    {index + 1}. {item.prompt}
                  </p>
                  {item.kind === 'choice' && item.options.length > 0 && (
                    <p className="text-muted-foreground text-xs">
                      {item.options.join(' · ')}
                    </p>
                  )}
                </li>
              )
            )}
          </ol>
        </div>
      )}
    </div>
  );
}

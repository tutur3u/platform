'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from '@tuturuuu/icons';
import {
  readMeetCallRating,
  updateMeetCallRating,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

const VALUES = [1, 2, 3, 4, 5] as const;

/**
 * The viewer's private 1–5 rating of the call, on its own card below the
 * summary. The room decides who attended: a refused read hides the card
 * instead of offering a rating the room would reject.
 */
export function EndedMeetingRating({
  accountId,
  meetingId,
}: {
  accountId: string;
  meetingId: string;
}) {
  const t = useTranslations('meet.call');
  const titleId = useId();
  const client = useQueryClient();
  const queryKey = ['meet-call-rating', accountId, meetingId];
  const rating = useQuery({
    queryKey,
    queryFn: () => readMeetCallRating(meetingId),
    retry: false,
    staleTime: Infinity,
  });
  const save = useMutation({
    mutationFn: (value: number) => updateMeetCallRating(meetingId, value),
    onMutate: async (value) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<{ rating: number | null }>(queryKey);
      client.setQueryData(queryKey, { rating: value });
      return { previous };
    },
    onError: (_error, _value, context) => {
      client.setQueryData(queryKey, context?.previous);
      toast.error(t('rating_failed'));
    },
    onSuccess: (data) => client.setQueryData(queryKey, data),
  });
  if (!rating.data) return null;
  const current = rating.data.rating;
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-3xl border bg-card px-5 py-4 text-center text-card-foreground shadow-sm sm:justify-between sm:text-left"
    >
      <div className="grid min-w-0 gap-0.5">
        <h2 id={titleId} className="font-semibold text-[0.9375rem]">
          {t('rating_title')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('rating_private')}</p>
      </div>
      <div
        role="radiogroup"
        aria-labelledby={titleId}
        className="flex justify-center"
      >
        {VALUES.map((value) => {
          const filled = current !== null && value <= current;
          return (
            <Button
              variant="ghost"
              size="icon"
              key={value}
              type="button"
              role="radio"
              aria-checked={current === value}
              aria-label={t('rating_option', { value })}
              disabled={save.isPending}
              onClick={() => save.mutate(value)}
              className={cn(
                'size-11 rounded-xl text-muted-foreground',
                filled && 'text-foreground'
              )}
            >
              <Star className={cn('size-5', filled && 'fill-current')} />
            </Button>
          );
        })}
      </div>
    </section>
  );
}

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

const VALUES = [1, 2, 3, 4, 5] as const;

/**
 * The viewer's private 1–5 rating of the call. The room decides who
 * attended: a refused read hides the control instead of offering a rating
 * the room would reject.
 */
export function EndedMeetingRating({
  accountId,
  meetingId,
}: {
  accountId: string;
  meetingId: string;
}) {
  const t = useTranslations('meet.call');
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
    <fieldset className="grid justify-items-center gap-1">
      <legend className="mx-auto text-muted-foreground text-sm">
        {t('rating_title')}
      </legend>
      <div
        role="radiogroup"
        aria-label={t('rating_title')}
        className="flex justify-center gap-1"
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
                'size-11 rounded-md text-muted-foreground',
                filled && 'text-foreground'
              )}
            >
              <Star className={cn('size-4', filled && 'fill-current')} />
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}

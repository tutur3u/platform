'use client';

import { UserRoundCheck } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

/**
 * The 18+ rule, shown wherever Mira is offered.
 *
 * `inline` is the sentence itself; with `consent` it also states the condition
 * a person accepts by choosing Continue. `compact` is a badge for a tight
 * control: pass the same `id` to that control's `aria-describedby`, so the
 * control keeps its own name and the sentence is read as its description.
 */
export function MiraAdultNotice({
  variant = 'inline',
  consent = false,
  id,
  className,
}: {
  variant?: 'compact' | 'inline';
  consent?: boolean;
  id?: string;
  className?: string;
}) {
  const t = useTranslations('meet.mira_adults');
  if (variant === 'compact')
    return (
      <span
        className={cn(
          'inline-flex h-5 shrink-0 items-center rounded-full border px-1.5 font-semibold text-[0.65rem] text-muted-foreground leading-none',
          className
        )}
      >
        <span aria-hidden>{t('badge')}</span>
        <span id={id} className="sr-only" aria-hidden>
          {t('notice')}
        </span>
      </span>
    );
  return (
    <p
      id={id}
      className={cn(
        'flex items-start gap-1.5 text-pretty text-muted-foreground text-xs',
        className
      )}
    >
      <UserRoundCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>{t(consent ? 'consent' : 'notice')}</span>
    </p>
  );
}

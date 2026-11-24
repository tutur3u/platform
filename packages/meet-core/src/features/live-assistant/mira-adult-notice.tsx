'use client';

import { UserRoundCheck } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

/**
 * The 18+ rule as a sentence. With `consent` it also states the condition a
 * person accepts by choosing Continue. Pass `id` to a control's
 * `aria-describedby` so the control keeps its own name and the sentence is
 * read as its description.
 */
export function MiraAdultNotice({
  consent = false,
  id,
  className,
}: {
  consent?: boolean;
  id?: string;
  className?: string;
}) {
  const t = useTranslations('meet.mira_adults');
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

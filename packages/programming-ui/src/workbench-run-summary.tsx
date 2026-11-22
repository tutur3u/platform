'use client';
import { Check, X } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { classNames as cn } from './class-names';

/** Exit status and, for runs this browser started, how long they took. */
export function WorkbenchRunSummary({
  exitCode,
  durationMs,
}: {
  exitCode: number;
  durationMs?: number | null;
}) {
  const t = useTranslations('programmingPlayground');
  const ok = exitCode === 0;
  const Icon = ok ? Check : X;
  return (
    <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
      <span
        className={cn(
          'inline-flex h-6 items-center gap-1 rounded-full border px-2 font-semibold',
          ok
            ? 'border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green'
            : 'border-dynamic-red/25 bg-dynamic-red/10 text-dynamic-red'
        )}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        {t('exitCode', { code: exitCode })}
      </span>
      {durationMs != null && durationMs >= 0 && (
        <span>
          {t('runDuration', {
            seconds: (Math.max(durationMs, 10) / 1000).toFixed(2),
          })}
        </span>
      )}
    </div>
  );
}

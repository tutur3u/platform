'use client';

import { useTranslations } from 'next-intl';
import type { SelfRoomView } from './self-room';

/**
 * Host view of who is contributing. It never says why someone is not; a
 * guest, a declined choice and an unsupported device read the same.
 */
export function SelfCoverage({
  coverage,
  names,
}: {
  coverage: SelfRoomView['coverage'];
  names: Record<string, string>;
}) {
  const t = useTranslations('meet.ai');
  if (!coverage.length) return null;
  return (
    <section aria-label={t('self_coverage_title')} className="space-y-1">
      <h3 className="font-medium text-xs">{t('self_coverage_title')}</h3>
      <ul className="space-y-0.5 text-xs">
        {coverage.map((entry) => (
          <li
            key={entry.accountId}
            className="flex justify-between gap-2"
            data-contributing={entry.contributing}
          >
            <span className="truncate">{names[entry.accountId] ?? ''}</span>
            <span className="shrink-0 text-muted-foreground">
              {entry.contributing ? t('self_coverage_yes') : t('self_coverage_no')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

'use client';
import type { LettinOverview } from '@tuturuuu/internal-api/lettin';
import { useTranslations } from 'next-intl';

export type StudioOrder = 'source' | 'ascending' | 'descending';

export function orderStudioWorlds(
  worlds: LettinOverview['worlds'],
  order: StudioOrder,
  locale: string
) {
  if (order === 'source') return worlds;
  const collator = new Intl.Collator(locale, {
    numeric: true,
    sensitivity: 'base',
  });
  return [...worlds].sort((left, right) =>
    order === 'ascending'
      ? collator.compare(left.draft.title, right.draft.title)
      : collator.compare(right.draft.title, left.draft.title)
  );
}

export function StudioOrderControl({
  value,
  onChange,
}: {
  value: StudioOrder;
  onChange: (value: StudioOrder) => void;
}) {
  const t = useTranslations('lettin');
  return (
    <label className="mb-5 flex flex-wrap items-center gap-3 text-sm">
      <span>{t('studioOrder')}</span>
      <select
        className="max-w-full rounded-md border border-input bg-background px-3 py-2 text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value as StudioOrder)}
      >
        {(['source', 'ascending', 'descending'] as const).map((order) => (
          <option key={order} value={order}>
            {t(`studioOrder_${order}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

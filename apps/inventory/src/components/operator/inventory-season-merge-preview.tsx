'use client';

import type { InventorySeasonMergePreview } from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';

export function InventorySeasonMergePreviewContent({
  data,
}: {
  data: InventorySeasonMergePreview;
}) {
  const t = useTranslations('inventory.operator.seasonMerge');
  const range = (from: string | null, to: string | null) =>
    `${from || t('unbounded')} → ${to || t('unbounded')}`;
  return (
    <div className="grid min-w-0 gap-4 text-sm [overflow-wrap:anywhere]">
      <p>
        {t('retainedHistory', {
          assignments: data.assignmentCount,
          quotes: data.historicalQuoteCount,
        })}
      </p>
      <p>
        {t(data.futurePriceCount > 0 ? 'pricedCalendar' : 'unpricedCalendar')}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['source', 'target'] as const).map((side) => (
          <section
            key={side}
            className="grid min-w-0 gap-2 rounded-md border p-3"
          >
            <h3 className="font-semibold">
              {t(side)}: {data[side].name}
            </h3>
            <p>{data[side].description || t('noDescription')}</p>
            <p>
              {range(data[side].starts_at, data[side].ends_at)} ·{' '}
              {data[side].time_zone} · {data[side].pricing_mode}
            </p>
            <p>
              {t(`scope_${data[side].product_scope}`)} ·{' '}
              {t('ruleCount', {
                count:
                  side === 'source'
                    ? data.sourceRuleCount
                    : data.targetRuleCount,
              })}
            </p>
            <ul className="grid gap-1">
              {(side === 'source' ? data.sourceRules : data.targetRules).map(
                (rule) => (
                  <li key={rule.id}>{rule.name}</li>
                )
              )}
            </ul>
          </section>
        ))}
      </div>
      <section className="grid gap-2">
        <h3 className="font-semibold">
          {t('prices', { count: data.futurePriceCount })}
        </h3>
        {data.futurePrices.map((price) => (
          <div
            key={price.id}
            className="grid min-w-0 gap-1 rounded-md border p-3"
          >
            <p>
              {price.productName} · {price.unitName} · {price.warehouseName}
            </p>
            <p>
              {price.price} {price.currency}
            </p>
            <p>{range(price.validFrom, price.validTo)}</p>
          </div>
        ))}
      </section>
      <section className="grid gap-2">
        <h3 className="font-semibold">
          {t('conflicts', { count: data.conflictCount })}
        </h3>
        {data.conflicts.map((conflict) => (
          <div
            key={`${conflict.sourcePriceId}:${conflict.targetPriceId}`}
            className="grid min-w-0 gap-1 rounded-md border border-destructive/30 p-3"
          >
            <p>
              {conflict.productName} · {conflict.unitName} ·{' '}
              {conflict.warehouseName}
            </p>
            <p>
              {t('source')}: {conflict.sourcePrice} {conflict.sourceCurrency} ·{' '}
              {range(conflict.sourceFrom, conflict.sourceTo)}
            </p>
            <p>
              {t('target')}: {conflict.targetPrice} {conflict.targetCurrency} ·{' '}
              {range(conflict.targetFrom, conflict.targetTo)}
            </p>
          </div>
        ))}
      </section>
      {data.blockers.length > 0 ? (
        <div
          role="alert"
          className="grid gap-2 rounded-md border border-destructive/30 p-3 text-destructive"
        >
          {data.blockers.map((code) => (
            <p key={code}>
              {t(
                code === 'pricing_calendar_mismatch'
                  ? 'calendarBlocked'
                  : code === 'inactive_destination'
                    ? 'inactiveBlocked'
                    : code === 'merged_stock_identity'
                      ? 'identityBlocked'
                      : 'unsupportedBlocked'
              )}
            </p>
          ))}
        </div>
      ) : null}
      <p>{t('expires', { time: data.expiresAt })}</p>
    </div>
  );
}

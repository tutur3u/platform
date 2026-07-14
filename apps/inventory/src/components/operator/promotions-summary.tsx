import { CheckCircle2, TicketPercent, Users } from '@tuturuuu/icons';
import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import { useTranslations } from 'next-intl';

export function PromotionsSummary({
  promotions,
}: {
  promotions: ProductPromotion[];
}) {
  const t = useTranslations('inventory.operator.promotions.summary');
  const totalUses = promotions.reduce(
    (sum, promotion) => sum + (promotion.current_uses ?? 0),
    0
  );
  const synced = promotions.filter(
    (promotion) => promotion.polar_discount_id
  ).length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid lg:grid-cols-[1.4fr_1fr]">
        <div className="flex min-h-32 flex-col justify-between gap-6 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-primary">
            <TicketPercent className="size-4" />
            <span className="font-medium text-xs uppercase tracking-wider">
              {t('eyebrow')}
            </span>
          </div>
          <div>
            <p className="font-semibold text-3xl tabular-nums">
              {promotions.length}
            </p>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('campaigns', { count: promotions.length })}
            </p>
          </div>
        </div>
        <div className="grid border-border border-t sm:grid-cols-2 lg:border-t-0 lg:border-l">
          <SummaryDatum
            icon={Users}
            label={t('uses')}
            value={String(totalUses)}
          />
          <SummaryDatum
            icon={CheckCircle2}
            label={t('polarSynced')}
            value={`${synced}/${promotions.length}`}
          />
        </div>
      </div>
    </section>
  );
}

function SummaryDatum({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-28 flex-col justify-between gap-4 border-border p-5 sm:odd:border-r lg:not-last:border-b lg:odd:border-r-0">
      <Icon className="size-4 text-muted-foreground" />
      <div>
        <p className="font-semibold text-xl tabular-nums">{value}</p>
        <p className="mt-1 text-muted-foreground text-xs">{label}</p>
      </div>
    </div>
  );
}

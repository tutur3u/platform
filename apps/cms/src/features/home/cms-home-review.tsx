import { AlertCircle, CheckCircle2 } from '@tuturuuu/icons';
import type { ExternalProjectAttentionItem } from '@tuturuuu/types';
import { useTranslations } from 'next-intl';
import { QueuePanel } from './cms-home-panels';

export function CmsHomeReview({
  actionHref,
  items,
  stats,
  urlPathLabel,
}: {
  actionHref: string;
  items: ExternalProjectAttentionItem[];
  stats: ReadonlyArray<readonly [string, number]>;
  urlPathLabel: string;
}) {
  const t = useTranslations('external-projects');

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-lg border border-border/70 bg-card/75 p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-muted-foreground" />
          <h2 className="font-medium text-sm">
            {t('epm.home_content_status_title')}
          </h2>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {stats.map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-border/70 bg-background/60 px-3 py-3"
            >
              <div className="font-semibold text-xl tabular-nums">{value}</div>
              <div className="mt-1 truncate text-muted-foreground text-xs">
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>
      <QueuePanel
        actionHref={actionHref}
        emptyLabel={t('epm.empty_entries')}
        icon={<AlertCircle className="size-4" />}
        items={items}
        title={t('epm.attention_title')}
        urlPathLabel={urlPathLabel}
      />
    </div>
  );
}

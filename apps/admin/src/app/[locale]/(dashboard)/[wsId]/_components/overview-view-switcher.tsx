import { Briefcase, Wrench } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export const OVERVIEW_VIEWS = ['executive', 'operations'] as const;
export type OverviewView = (typeof OVERVIEW_VIEWS)[number];

export function parseOverviewView(
  value: string | string[] | undefined
): OverviewView {
  const raw = Array.isArray(value) ? value[0] : value;
  return OVERVIEW_VIEWS.includes(raw as OverviewView)
    ? (raw as OverviewView)
    : 'executive';
}

export function getOverviewViewHref(wsId: string, view: OverviewView) {
  return view === 'executive' ? `/${wsId}` : `/${wsId}?view=${view}`;
}

const VIEW_ICONS = {
  executive: Briefcase,
  operations: Wrench,
} as const;

export default async function OverviewViewSwitcher({
  view,
  wsId,
}: {
  view: OverviewView;
  wsId: string;
}) {
  const t = await getTranslations('infrastructure-analytics.views');

  return (
    <nav
      aria-label={t('label')}
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="inline-flex w-full rounded-lg border border-border bg-muted/40 p-1 sm:w-auto">
        {OVERVIEW_VIEWS.map((option) => {
          const Icon = VIEW_ICONS[option];
          const active = option === view;
          return (
            <Link
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-1.5 font-medium text-sm transition-colors sm:flex-none',
                active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              href={getOverviewViewHref(wsId, option)}
              key={option}
            >
              <Icon className="h-4 w-4" />
              {t(`${option}.title`)}
            </Link>
          );
        })}
      </div>
      <p className="text-muted-foreground text-sm">
        {t(`${view}.description`)}
      </p>
    </nav>
  );
}

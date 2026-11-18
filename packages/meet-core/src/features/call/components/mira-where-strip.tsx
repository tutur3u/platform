'use client';

import {
  ChartNoAxesColumn,
  CodeXml,
  FileText,
  Presentation,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { MiraLiveDot } from './mira-presence';

export const miraSurfaces = [
  'polls',
  'docs',
  'programming',
  'whiteboard',
] as const;
export type MiraSurface = (typeof miraSurfaces)[number];

export const miraSurfaceIcons = {
  polls: ChartNoAxesColumn,
  docs: FileText,
  programming: CodeXml,
  whiteboard: Presentation,
};

export type MiraSurfaceActivity = {
  active: boolean;
  status: string;
  title?: string;
  preview?: { before?: string; selection: string; after?: string };
};

export function MiraWhereStrip({
  activity,
  onFocusSurface,
}: {
  activity?: Partial<Record<MiraSurface, MiraSurfaceActivity>>;
  onFocusSurface?: (surface: MiraSurface) => void;
}) {
  const t = useTranslations('meet.call.miraEverywhere');
  return (
    <section aria-label={t('where')} className="@container min-w-0">
      <ul className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        {miraSurfaces.map((surface) => {
          const item = activity?.[surface];
          const Icon = miraSurfaceIcons[surface];
          const className = cn(
            'grid w-full min-w-0 gap-1.5 rounded-xl border bg-card p-2.5 text-start text-xs',
            item?.active &&
              'border-dynamic-purple/40 ring-1 ring-dynamic-purple/15'
          );
          const content = (
            <>
              <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                <Icon
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate">
                  {item?.title || t(`surfaces.${surface}`)}
                </span>
                {item?.active && (
                  <span className="inline-flex shrink-0">
                    <MiraLiveDot avatar />
                    <span className="sr-only">{t('active')}</span>
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'truncate',
                  item?.active
                    ? 'font-medium text-dynamic-purple'
                    : 'text-muted-foreground'
                )}
              >
                {item?.status || t('idle')}
              </span>
              {item?.preview && (
                <span className="truncate rounded-md border bg-background px-1.5 py-1 font-mono">
                  {item.preview.before}
                  <span
                    className={cn(
                      item.active &&
                        'rounded-sm border-dynamic-purple/60 border-b-2 bg-dynamic-purple/15'
                    )}
                  >
                    {item.preview.selection}
                  </span>
                  {item.active && (
                    <span
                      aria-hidden
                      className="inline-block h-3 w-0.5 align-middle bg-dynamic-purple motion-safe:animate-pulse motion-reduce:animate-none"
                    />
                  )}
                  {item.preview.after}
                </span>
              )}
            </>
          );
          return (
            <li key={surface} className="min-w-0">
              {onFocusSurface ? (
                <button
                  type="button"
                  className={cn(
                    className,
                    'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none'
                  )}
                  onClick={() => onFocusSurface(surface)}
                >
                  {content}
                </button>
              ) : (
                <div className={className}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

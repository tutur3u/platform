'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Kbd } from '@tuturuuu/ui/kbd';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { ComponentPreview } from './component-preview';
import type { ComponentEntry } from './component-registry';
import type { ShowcaseSettings } from './showcase-types';

const densityClass = {
  compact: 'gap-3 p-3',
  comfortable: 'gap-4 p-4',
  spacious: 'gap-6 p-6',
};

const radiusClass = {
  square: 'rounded-none',
  rounded: 'rounded-md',
  soft: 'rounded-lg',
};

const surfaceClass = {
  plain: 'bg-background',
  muted: 'bg-muted/40',
  elevated: 'bg-card shadow-sm',
};

export function ComponentCard({
  entry,
  settings,
}: {
  entry: ComponentEntry;
  settings: ShowcaseSettings;
}) {
  const t = useTranslations('ui-showcase');
  const tx = t as unknown as (
    key: string,
    values?: Record<string, string>
  ) => string;
  const status = entry.safePreview === false ? 'pattern' : 'live';

  return (
    <article
      className="scroll-mt-28 rounded-lg border bg-background"
      id={`component-${entry.id}`}
    >
      <div className="grid gap-4 p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-xl">{entry.name}</h2>
              <Badge variant={status === 'live' ? 'success' : 'outline'}>
                {t(`status.${status}`)}
              </Badge>
              <Badge variant="secondary">
                {t(`categories.${entry.category}`)}
              </Badge>
            </div>
            <p className="max-w-3xl text-muted-foreground text-sm leading-6">
              {tx('components.description', {
                importPath: entry.importPath,
                name: entry.name,
              })}
            </p>
          </div>
          <code className="w-fit rounded-md bg-muted px-2 py-1 text-xs">
            {entry.importPath}
          </code>
        </div>

        <div
          className={cn(
            'grid min-h-48 place-items-center overflow-hidden border transition-all',
            densityClass[settings.density],
            radiusClass[settings.radius],
            surfaceClass[settings.surface]
          )}
        >
          <ComponentPreview entry={entry} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          {settings.showCode ? (
            <div className="grid gap-2">
              <div className="font-medium text-sm">{t('card.usage')}</div>
              <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/50 p-3 text-xs leading-5">
                <code>{entry.usage}</code>
              </pre>
            </div>
          ) : null}

          {settings.showCustomizations ? (
            <div className="grid content-start gap-2">
              <div className="font-medium text-sm">
                {t('card.customizations')}
              </div>
              <div className="flex flex-wrap gap-2">
                {entry.customizationKeys.map((key) => (
                  <Kbd key={key}>{tx(`customizations.${key}`)}</Kbd>
                ))}
              </div>
              <Separator className="my-1" />
              <div className="text-muted-foreground text-xs leading-5">
                {t('card.customizationHint')}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

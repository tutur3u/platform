'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
import type { ComponentEntry } from './component-registry';
import { renderAdvancedPreview } from './preview-advanced';
import { renderFoundationPreview } from './preview-foundations';

export function ComponentPreview({ entry }: { entry: ComponentEntry }) {
  const s = useTranslations('ui-showcase.samples');
  const sample = s as unknown as (key: string) => string;
  const preview =
    renderFoundationPreview(entry.id, sample) ??
    renderAdvancedPreview(entry.id, sample);

  if (preview) {
    return preview;
  }

  return (
    <div className="grid w-full gap-3 rounded-lg border bg-muted/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium">{entry.name}</div>
        <Badge variant="outline">{s('pattern')}</Badge>
      </div>
      <div className="text-muted-foreground text-sm">{s('patternPreview')}</div>
      <code className="rounded-md bg-background px-2 py-1 text-xs">
        {entry.importPath}
      </code>
    </div>
  );
}

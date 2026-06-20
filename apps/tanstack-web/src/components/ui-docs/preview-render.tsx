'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { renderAdvancedPreview } from './preview-advanced';
import { renderFoundationPreview } from './preview-foundations';
import type { PreviewEntry } from './preview-thumbnail';
import { useUiDocsTranslator } from './ui-docs-i18n';

/**
 * Heavy preview renderer for the UI docs examples.
 */
export default function PreviewRender({ entry }: { entry: PreviewEntry }) {
  const sample = useUiDocsTranslator('samples');
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
        <Badge variant="outline">{sample('pattern')}</Badge>
      </div>
      <div className="text-muted-foreground text-sm">
        {sample('patternPreview')}
      </div>
      <code className="rounded-md bg-background px-2 py-1 text-xs">
        {entry.importPath}
      </code>
    </div>
  );
}

'use client';

import { Eye } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { DiffViewer } from '@tuturuuu/ui/diff-viewer';

interface TextDiffViewerProps {
  oldValue: string | null | undefined;
  newValue: string | null | undefined;
  t: (key: string, options?: { defaultValue?: string }) => string;
  fieldLabel?: string;
  triggerVariant?: 'button' | 'inline';
  trigger?: React.ReactNode;
}

export function TextDiffViewer({
  oldValue,
  newValue,
  t,
  fieldLabel,
  triggerVariant = 'button',
  trigger,
}: TextDiffViewerProps) {
  const defaultTrigger =
    triggerVariant === 'inline' ? (
      <button
        type="button"
        className="inline-flex items-center gap-1 text-dynamic-blue text-xs hover:underline"
      >
        <Eye className="h-3 w-3" />
        {t('view_diff', { defaultValue: 'View diff' })}
      </button>
    ) : (
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
        <Eye className="h-3.5 w-3.5" />
        {t('view_diff', { defaultValue: 'View diff' })}
      </Button>
    );

  return (
    <DiffViewer
      oldValue={oldValue}
      newValue={newValue}
      oldLabel={t('old_value', { defaultValue: 'Previous' })}
      newLabel={t('new_value', { defaultValue: 'Current' })}
      wrapper="dialog"
      dialogTitle={
        fieldLabel || t('text_changes', { defaultValue: 'Text Changes' })
      }
      trigger={trigger || defaultTrigger}
      granularity="word"
      viewMode="unified"
    />
  );
}

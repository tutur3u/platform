'use client';

import { ArrowRight, Eye } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { cn } from '@tuturuuu/utils/format';
import { useMemo } from 'react';

interface TextDiffViewerProps {
  oldValue: string | null | undefined;
  newValue: string | null | undefined;
  t: (key: string, options?: { defaultValue?: string }) => string;
  /** Label for the field being compared */
  fieldLabel?: string;
  /** Trigger button variant */
  triggerVariant?: 'button' | 'inline';
  /** Optional custom trigger element */
  trigger?: React.ReactNode;
}

interface CharDiff {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
}

/**
 * Compute character-level diff between two strings
 * Uses a simple LCS-based approach for short text
 */
function computeCharDiff(oldText: string, newText: string): CharDiff[] {
  if (!oldText && !newText) return [];
  if (!oldText) return [{ type: 'added', value: newText }];
  if (!newText) return [{ type: 'removed', value: oldText }];

  // For very long strings, just show the whole thing as changed
  if (oldText.length > 500 || newText.length > 500) {
    return [
      { type: 'removed', value: oldText },
      { type: 'added', value: newText },
    ];
  }

  // Simple word-level diff for readability
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);

  const result: CharDiff[] = [];
  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldWords.length || newIdx < newWords.length) {
    const oldWord = oldWords[oldIdx];
    const newWord = newWords[newIdx];

    if (oldWord === newWord) {
      if (oldWord) result.push({ type: 'unchanged', value: oldWord });
      oldIdx++;
      newIdx++;
    } else if (oldWord && !newWords.slice(newIdx).includes(oldWord)) {
      result.push({ type: 'removed', value: oldWord });
      oldIdx++;
    } else if (newWord && !oldWords.slice(oldIdx).includes(newWord)) {
      result.push({ type: 'added', value: newWord });
      newIdx++;
    } else {
      // Word exists later, skip ahead
      if (oldWord) result.push({ type: 'removed', value: oldWord });
      oldIdx++;
    }
  }

  return result;
}

export function TextDiffViewer({
  oldValue,
  newValue,
  t,
  fieldLabel,
  triggerVariant = 'button',
  trigger,
}: TextDiffViewerProps) {
  const oldText = oldValue ?? '';
  const newText = newValue ?? '';

  const diff = useMemo(
    () => computeCharDiff(oldText, newText),
    [oldText, newText]
  );

  // Check if there are actual changes
  const hasChanges = oldText !== newText;

  if (!hasChanges) {
    return null;
  }

  const defaultTrigger =
    triggerVariant === 'inline' ? (
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs text-dynamic-blue hover:underline"
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

  const label =
    fieldLabel || t('text_changes', { defaultValue: 'Text Changes' });

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>

        {/* Side by side comparison */}
        <div className="space-y-4">
          {/* Before */}
          <div className="space-y-2">
            <h4 className="font-medium text-muted-foreground text-sm">
              {t('old_value', { defaultValue: 'Previous' })}
            </h4>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="whitespace-pre-wrap break-words text-sm">
                {oldText || (
                  <span className="italic text-muted-foreground">
                    {t('value.empty', { defaultValue: 'Empty' })}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <ArrowRight className="h-5 w-5 rotate-90 text-muted-foreground" />
          </div>

          {/* After */}
          <div className="space-y-2">
            <h4 className="font-medium text-muted-foreground text-sm">
              {t('new_value', { defaultValue: 'Current' })}
            </h4>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="whitespace-pre-wrap break-words text-sm">
                {newText || (
                  <span className="italic text-muted-foreground">
                    {t('value.empty', { defaultValue: 'Empty' })}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Inline diff view */}
          <div className="space-y-2">
            <h4 className="font-medium text-muted-foreground text-sm">
              {t('diff_view', { defaultValue: 'Changes' })}
            </h4>
            <div className="rounded-md border bg-background p-3">
              <p className="text-sm">
                {diff.map((part, idx) => (
                  <span
                    key={idx}
                    className={cn(
                      part.type === 'added' &&
                        'bg-dynamic-green/20 text-dynamic-green',
                      part.type === 'removed' &&
                        'bg-dynamic-red/20 text-dynamic-red line-through'
                    )}
                  >
                    {part.value}
                  </span>
                ))}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

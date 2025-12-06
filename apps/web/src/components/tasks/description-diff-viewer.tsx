'use client';

import { Columns2, Eye, Minus, Plus, Rows2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import {
  computeLineDiff,
  getDiffStats,
  type DiffChange,
} from '@tuturuuu/utils/text-diff';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import { useMemo, useState } from 'react';

type DiffViewMode = 'unified' | 'split';

interface DescriptionDiffViewerProps {
  oldValue: unknown;
  newValue: unknown;
  t: (key: string, options?: { defaultValue?: string }) => string;
  /** Trigger button variant */
  triggerVariant?: 'button' | 'inline';
  /** Optional custom trigger element */
  trigger?: React.ReactNode;
}

export function DescriptionDiffViewer({
  oldValue,
  newValue,
  t,
  triggerVariant = 'button',
  trigger,
}: DescriptionDiffViewerProps) {
  const [viewMode, setViewMode] = useState<DiffViewMode>('unified');

  const oldText = useMemo(
    () => getDescriptionText(oldValue as string),
    [oldValue]
  );
  const newText = useMemo(
    () => getDescriptionText(newValue as string),
    [newValue]
  );

  const diff = useMemo(
    () => computeLineDiff(oldText, newText),
    [oldText, newText]
  );
  const stats = useMemo(() => getDiffStats(diff), [diff]);

  // Check if there are actual changes
  const hasChanges = diff.some((d) => d.type !== 'unchanged');

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
        {t('view_changes', { defaultValue: 'View changes' })}
      </button>
    ) : (
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
        <Eye className="h-3.5 w-3.5" />
        {t('view_changes', { defaultValue: 'View changes' })}
      </Button>
    );

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>
              {t('description_changes', {
                defaultValue: 'Description Changes',
              })}
            </DialogTitle>
            <Tabs
              value={viewMode}
              onValueChange={(v) => setViewMode(v as DiffViewMode)}
            >
              <TabsList className="h-8">
                <TabsTrigger value="unified" className="gap-1.5 px-2.5 text-xs">
                  <Rows2 className="h-3.5 w-3.5" />
                  {t('unified_view', { defaultValue: 'Unified' })}
                </TabsTrigger>
                <TabsTrigger value="split" className="gap-1.5 px-2.5 text-xs">
                  <Columns2 className="h-3.5 w-3.5" />
                  {t('split_view', { defaultValue: 'Split' })}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </DialogHeader>

        {/* Stats bar */}
        <div className="flex gap-4 border-b pb-2 text-sm">
          <span className="flex items-center gap-1 text-dynamic-green">
            <Plus className="h-3 w-3" />
            {stats.added} {t('lines_added', { defaultValue: 'added' })}
          </span>
          <span className="flex items-center gap-1 text-dynamic-red">
            <Minus className="h-3 w-3" />
            {stats.removed} {t('lines_removed', { defaultValue: 'removed' })}
          </span>
        </div>

        {/* Diff view */}
        <ScrollArea className="h-[50vh] md:h-[60vh] lg:h-[70vh]">
          {viewMode === 'unified' ? (
            <UnifiedDiffView diff={diff} />
          ) : (
            <SplitDiffView
              oldText={oldText}
              newText={newText}
              diff={diff}
              t={t}
            />
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function UnifiedDiffView({ diff }: { diff: DiffChange[] }) {
  return (
    <div className="space-y-0.5 font-mono text-sm">
      {diff.map((change, index) => (
        <DiffLine key={index} change={change} />
      ))}
    </div>
  );
}

interface SplitDiffViewProps {
  oldText: string;
  newText: string;
  diff: DiffChange[];
  t: (key: string, options?: { defaultValue?: string }) => string;
}

function SplitDiffView({ oldText, newText, diff, t }: SplitDiffViewProps) {
  // Process diff to create aligned left/right pairs
  const pairs = useMemo(() => {
    const result: Array<{
      left: { lines: string[]; type: 'removed' | 'unchanged' } | null;
      right: { lines: string[]; type: 'added' | 'unchanged' } | null;
    }> = [];

    let i = 0;
    while (i < diff.length) {
      const current = diff[i];

      if (!current) {
        i++;
        continue;
      }

      if (current.type === 'unchanged') {
        // Unchanged lines go on both sides
        const lines = current.value.split('\n').filter(Boolean);
        result.push({
          left: { lines, type: 'unchanged' },
          right: { lines, type: 'unchanged' },
        });
        i++;
      } else if (current.type === 'removed') {
        // Check if next is added (paired change)
        const next = diff[i + 1];
        const removedLines = current.value.split('\n').filter(Boolean);

        if (next && next.type === 'added') {
          const addedLines = next.value.split('\n').filter(Boolean);
          // Pair removed with added
          const maxLen = Math.max(removedLines.length, addedLines.length);
          for (let j = 0; j < maxLen; j++) {
            result.push({
              left:
                j < removedLines.length
                  ? { lines: [removedLines[j]!], type: 'removed' }
                  : null,
              right:
                j < addedLines.length
                  ? { lines: [addedLines[j]!], type: 'added' }
                  : null,
            });
          }
          i += 2;
        } else {
          // Just removed, no pair
          for (const line of removedLines) {
            result.push({
              left: { lines: [line], type: 'removed' },
              right: null,
            });
          }
          i++;
        }
      } else if (current.type === 'added') {
        // Added without preceding removed
        const addedLines = current.value.split('\n').filter(Boolean);
        for (const line of addedLines) {
          result.push({
            left: null,
            right: { lines: [line], type: 'added' },
          });
        }
        i++;
      } else {
        i++;
      }
    }

    return result;
  }, [diff]);

  return (
    <div className="grid grid-cols-2 gap-0.5">
      {/* Headers */}
      <div className="sticky top-0 z-10 border-b bg-muted/80 px-3 py-1.5 font-medium text-muted-foreground text-xs backdrop-blur">
        {t('old_version', { defaultValue: 'Previous' })}
      </div>
      <div className="sticky top-0 z-10 border-b bg-muted/80 px-3 py-1.5 font-medium text-muted-foreground text-xs backdrop-blur">
        {t('new_version', { defaultValue: 'Current' })}
      </div>

      {/* Diff rows */}
      {pairs.map((pair, idx) => (
        <SplitDiffRow key={idx} left={pair.left} right={pair.right} />
      ))}
    </div>
  );
}

function SplitDiffRow({
  left,
  right,
}: {
  left: { lines: string[]; type: 'removed' | 'unchanged' } | null;
  right: { lines: string[]; type: 'added' | 'unchanged' } | null;
}) {
  return (
    <>
      {/* Left side (old) */}
      <div
        className={cn(
          'min-h-[24px] whitespace-pre-wrap border-r px-3 py-0.5 font-mono text-sm',
          left?.type === 'removed' && 'bg-dynamic-red/10 text-dynamic-red',
          left?.type === 'unchanged' && 'text-muted-foreground',
          !left && 'bg-muted/30'
        )}
      >
        {left?.lines.map((line, i) => (
          <div
            key={i}
            className={left.type === 'removed' ? 'line-through' : ''}
          >
            {left.type === 'removed' && (
              <span className="mr-2 inline-block w-3 text-right opacity-50">
                -
              </span>
            )}
            {line}
          </div>
        ))}
      </div>

      {/* Right side (new) */}
      <div
        className={cn(
          'min-h-[24px] whitespace-pre-wrap px-3 py-0.5 font-mono text-sm',
          right?.type === 'added' && 'bg-dynamic-green/10 text-dynamic-green',
          right?.type === 'unchanged' && 'text-muted-foreground',
          !right && 'bg-muted/30'
        )}
      >
        {right?.lines.map((line, i) => (
          <div key={i}>
            {right.type === 'added' && (
              <span className="mr-2 inline-block w-3 text-right opacity-50">
                +
              </span>
            )}
            {line}
          </div>
        ))}
      </div>
    </>
  );
}

function DiffLine({ change }: { change: DiffChange }) {
  // Split by lines and render each line separately
  const lines = change.value.split('\n').filter((line, idx, arr) => {
    // Keep all non-empty lines, and only the last empty line if there are multiple
    return line !== '' || idx === arr.length - 1;
  });

  if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
    return null;
  }

  return (
    <>
      {lines.map((line, idx) => {
        if (line === '') return null;
        return (
          <div
            key={idx}
            className={cn(
              'whitespace-pre-wrap rounded px-2 py-0.5',
              change.type === 'added' &&
                'bg-dynamic-green/10 text-dynamic-green',
              change.type === 'removed' &&
                'bg-dynamic-red/10 text-dynamic-red line-through',
              change.type === 'unchanged' && 'text-muted-foreground'
            )}
          >
            <span className="mr-2 inline-block w-4 text-right opacity-50">
              {change.type === 'added' && '+'}
              {change.type === 'removed' && '-'}
              {change.type === 'unchanged' && ' '}
            </span>
            {line}
          </div>
        );
      })}
    </>
  );
}

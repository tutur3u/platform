'use client';

import {
  ChevronsUpDown,
  Columns2,
  Eye,
  FileText,
  FoldVertical,
  Minus,
  Plus,
  Rows2,
  Type,
  WrapText,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Separator } from '@tuturuuu/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { cn } from '@tuturuuu/utils/format';
import {
  computeLineDiff,
  computeWordDiff,
  type DiffChange,
  getDiffStats,
} from '@tuturuuu/utils/text-diff';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import { useCallback, useMemo, useState } from 'react';

type DiffViewMode = 'unified' | 'split';
type DiffGranularity = 'line' | 'word';

/** Number of context lines to show around changes */
const CONTEXT_LINES = 3;

export interface DescriptionDiffViewerProps {
  oldValue: unknown;
  newValue: unknown;
  t: (
    key: string,
    options?: { defaultValue?: string; count?: number }
  ) => string;
  /** Trigger button variant */
  triggerVariant?: 'button' | 'inline';
  /** Optional custom trigger element */
  trigger?: React.ReactNode;
}

interface ProcessedLine {
  content: string;
  type: 'added' | 'removed' | 'unchanged';
  lineNumber: { old?: number; new?: number };
  originalIndex: number;
}

interface CollapsedBlock {
  type: 'collapsed';
  id: string;
  count: number;
  startIndex: number;
  endIndex: number;
}

type DiffDisplayItem = ProcessedLine | CollapsedBlock;

/**
 * Process diff into individual lines with line numbers
 */
function processDiffToLines(diff: DiffChange[]): ProcessedLine[] {
  const lines: ProcessedLine[] = [];
  let oldLineNum = 1;
  let newLineNum = 1;
  let originalIndex = 0;

  for (const change of diff) {
    const changeLines = change.value.split('\n');
    // Remove trailing empty line from split
    if (changeLines[changeLines.length - 1] === '') {
      changeLines.pop();
    }

    for (const line of changeLines) {
      if (change.type === 'unchanged') {
        lines.push({
          content: line,
          type: 'unchanged',
          lineNumber: { old: oldLineNum++, new: newLineNum++ },
          originalIndex: originalIndex++,
        });
      } else if (change.type === 'removed') {
        lines.push({
          content: line,
          type: 'removed',
          lineNumber: { old: oldLineNum++ },
          originalIndex: originalIndex++,
        });
      } else if (change.type === 'added') {
        lines.push({
          content: line,
          type: 'added',
          lineNumber: { new: newLineNum++ },
          originalIndex: originalIndex++,
        });
      }
    }
  }

  return lines;
}

/**
 * Collapse unchanged lines that are far from changes, keeping context around changes
 */
function collapseUnchangedLines(
  lines: ProcessedLine[],
  contextLines: number,
  expandedBlocks: Set<string>
): DiffDisplayItem[] {
  if (lines.length === 0) return [];

  // Find indices of all changed lines
  const changedIndices = lines
    .map((line, idx) => (line.type !== 'unchanged' ? idx : -1))
    .filter((idx) => idx !== -1);

  // If no changes, show a collapsed indicator for all lines
  if (changedIndices.length === 0) {
    const blockId = 'block-0';
    if (expandedBlocks.has(blockId)) {
      return lines;
    }
    return lines.length > 0
      ? [
          {
            type: 'collapsed' as const,
            id: blockId,
            count: lines.length,
            startIndex: 0,
            endIndex: lines.length - 1,
          },
        ]
      : [];
  }

  // Mark which lines should be visible (within context of a change)
  const visibleLines = new Set<number>();
  for (const changeIdx of changedIndices) {
    for (
      let i = Math.max(0, changeIdx - contextLines);
      i <= Math.min(lines.length - 1, changeIdx + contextLines);
      i++
    ) {
      visibleLines.add(i);
    }
  }

  // Build result with collapsed blocks
  const result: DiffDisplayItem[] = [];
  let collapsedStartIdx = -1;
  let collapsedCount = 0;
  let blockCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    if (visibleLines.has(i)) {
      if (collapsedCount > 0) {
        const blockId = `block-${blockCounter++}`;
        if (expandedBlocks.has(blockId)) {
          for (let j = collapsedStartIdx; j < i; j++) {
            result.push(lines[j]!);
          }
        } else {
          result.push({
            type: 'collapsed',
            id: blockId,
            count: collapsedCount,
            startIndex: collapsedStartIdx,
            endIndex: i - 1,
          });
        }
        collapsedCount = 0;
        collapsedStartIdx = -1;
      }
      result.push(lines[i]!);
    } else {
      if (collapsedStartIdx === -1) {
        collapsedStartIdx = i;
      }
      collapsedCount++;
    }
  }

  if (collapsedCount > 0) {
    const blockId = `block-${blockCounter}`;
    if (expandedBlocks.has(blockId)) {
      for (let j = collapsedStartIdx; j < lines.length; j++) {
        result.push(lines[j]!);
      }
    } else {
      result.push({
        type: 'collapsed',
        id: blockId,
        count: collapsedCount,
        startIndex: collapsedStartIdx,
        endIndex: lines.length - 1,
      });
    }
  }

  return result;
}

export function DescriptionDiffViewer({
  oldValue,
  newValue,
  t,
  triggerVariant = 'button',
  trigger,
}: DescriptionDiffViewerProps) {
  const [viewMode, setViewMode] = useState<DiffViewMode>('unified');
  const [granularity, setGranularity] = useState<DiffGranularity>('word');
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());

  const toggleBlock = useCallback((blockId: string) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }, []);

  const oldText = useMemo(
    () => getDescriptionText(oldValue as string),
    [oldValue]
  );
  const newText = useMemo(
    () => getDescriptionText(newValue as string),
    [newValue]
  );

  const lineDiff = useMemo(
    () => computeLineDiff(oldText, newText),
    [oldText, newText]
  );
  const wordDiff = useMemo(
    () => computeWordDiff(oldText, newText),
    [oldText, newText]
  );
  const diff = granularity === 'word' ? wordDiff : lineDiff;
  const stats = useMemo(() => getDiffStats(lineDiff), [lineDiff]);

  const processedLines = useMemo(() => processDiffToLines(diff), [diff]);
  const minimizedDiff = useMemo(
    () => collapseUnchangedLines(processedLines, CONTEXT_LINES, expandedBlocks),
    [processedLines, expandedBlocks]
  );

  const hasTextChanges = lineDiff.some((d) => d.type !== 'unchanged');

  const hasRawValueChanges = useMemo(() => {
    if (!oldValue && !newValue) return false;
    if (!oldValue || !newValue) return true;
    try {
      const oldStr =
        typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue);
      const newStr =
        typeof newValue === 'string' ? newValue : JSON.stringify(newValue);
      return oldStr !== newStr;
    } catch {
      return oldValue !== newValue;
    }
  }, [oldValue, newValue]);

  if (!hasTextChanges && !hasRawValueChanges) {
    return null;
  }

  const defaultTrigger =
    triggerVariant === 'inline' ? (
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-dynamic-blue text-xs transition-colors hover:bg-dynamic-blue/10"
      >
        <Eye className="h-3 w-3" />
        {t('view_changes', { defaultValue: 'View changes' })}
      </button>
    ) : (
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 px-2.5 text-xs"
      >
        <Eye className="h-3.5 w-3.5" />
        {t('view_changes', { defaultValue: 'View changes' })}
      </Button>
    );

  const noVisibleChanges = !hasTextChanges && hasRawValueChanges;

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent
        className="flex max-h-[90vh] w-[95vw] max-w-4xl flex-col gap-0 overflow-hidden p-0 md:max-w-5xl lg:max-w-6xl"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-base">
              {t('description_changes', {
                defaultValue: 'Description Changes',
              })}
            </DialogTitle>
            {!noVisibleChanges && (
              <div className="flex items-center gap-1">
                {/* Granularity toggle */}
                <ToggleGroup
                  type="single"
                  value={granularity}
                  onValueChange={(v) =>
                    v && setGranularity(v as DiffGranularity)
                  }
                  className="h-8"
                >
                  <ToggleGroupItem
                    value="word"
                    aria-label="Word diff"
                    className="h-7 gap-1.5 px-2.5 text-xs"
                  >
                    <Type className="h-3.5 w-3.5" />
                    {t('word_diff', { defaultValue: 'Word' })}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="line"
                    aria-label="Line diff"
                    className="h-7 gap-1.5 px-2.5 text-xs"
                  >
                    <WrapText className="h-3.5 w-3.5" />
                    {t('line_diff', { defaultValue: 'Line' })}
                  </ToggleGroupItem>
                </ToggleGroup>

                <Separator orientation="vertical" className="mx-1 h-5" />

                {/* View mode toggle */}
                <ToggleGroup
                  type="single"
                  value={viewMode}
                  onValueChange={(v) => v && setViewMode(v as DiffViewMode)}
                  className="h-8"
                >
                  <ToggleGroupItem
                    value="unified"
                    aria-label="Unified view"
                    className="h-7 gap-1.5 px-2.5 text-xs"
                  >
                    <Rows2 className="h-3.5 w-3.5" />
                    {t('unified_view', { defaultValue: 'Unified' })}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="split"
                    aria-label="Split view"
                    className="h-7 gap-1.5 px-2.5 text-xs"
                  >
                    <Columns2 className="h-3.5 w-3.5" />
                    {t('split_view', { defaultValue: 'Split' })}
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}
          </div>
        </DialogHeader>

        {noVisibleChanges ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <FileText className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="max-w-sm space-y-1.5 text-center">
              <p className="font-medium">
                {t('no_visible_changes', {
                  defaultValue: 'No visible text changes',
                })}
              </p>
              <p className="text-muted-foreground text-sm">
                {t('no_visible_changes_description', {
                  defaultValue:
                    'The description was modified but the text content appears the same. This may be due to formatting or structural changes.',
                })}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Stats bar */}
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className="gap-1.5 border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
                >
                  <Plus className="h-3 w-3" />
                  {stats.added} {t('lines_added', { defaultValue: 'added' })}
                </Badge>
                <Badge
                  variant="outline"
                  className="gap-1.5 border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red"
                >
                  <Minus className="h-3 w-3" />
                  {stats.removed}{' '}
                  {t('lines_removed', { defaultValue: 'removed' })}
                </Badge>
              </div>
              {expandedBlocks.size > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-muted-foreground text-xs"
                  onClick={() => setExpandedBlocks(new Set())}
                >
                  <FoldVertical className="h-3.5 w-3.5" />
                  {t('condense', { defaultValue: 'Condense' })}
                </Button>
              )}
            </div>

            {/* Diff view */}
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="p-4">
                {granularity === 'word' ? (
                  <WordDiffView
                    diff={wordDiff}
                    oldText={oldText}
                    newText={newText}
                    viewMode={viewMode}
                    t={t}
                    expandedBlocks={expandedBlocks}
                    onToggleBlock={toggleBlock}
                  />
                ) : viewMode === 'unified' ? (
                  <MinimizedUnifiedDiffView
                    items={minimizedDiff}
                    t={t}
                    onToggleBlock={toggleBlock}
                    expandedBlocks={expandedBlocks}
                  />
                ) : (
                  <MinimizedSplitDiffView
                    items={minimizedDiff}
                    t={t}
                    onToggleBlock={toggleBlock}
                    expandedBlocks={expandedBlocks}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MinimizedUnifiedDiffView({
  items,
  t,
  onToggleBlock,
  expandedBlocks,
}: {
  items: DiffDisplayItem[];
  t: (
    key: string,
    options?: { defaultValue?: string; count?: number }
  ) => string;
  onToggleBlock: (blockId: string) => void;
  expandedBlocks: Set<string>;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {items.map((item) => {
        if ('id' in item && item.type === 'collapsed') {
          return (
            <CollapsedLinesIndicator
              key={item.id}
              blockId={item.id}
              count={item.count}
              t={t}
              onToggle={onToggleBlock}
              isExpanded={expandedBlocks.has(item.id)}
            />
          );
        }

        const line = item as ProcessedLine;
        if (line.content === '' && line.type === 'unchanged') {
          return (
            <div
              key={`line-${line.originalIndex}`}
              className="flex min-h-6 border-border/50 border-b last:border-b-0"
            >
              <LineNumber value={line.lineNumber.old || line.lineNumber.new} />
              <div className="flex-1 px-3 py-0.5 font-mono text-muted-foreground text-sm">
                {' '}
              </div>
            </div>
          );
        }

        return (
          <div
            key={`line-${line.originalIndex}`}
            className={cn(
              'flex min-h-6 border-border/50 border-b last:border-b-0',
              line.type === 'added' && 'bg-dynamic-green/5',
              line.type === 'removed' && 'bg-dynamic-red/5'
            )}
          >
            <LineNumber
              value={line.lineNumber.old || line.lineNumber.new}
              type={line.type}
            />
            <div
              className={cn(
                'flex flex-1 items-start gap-2 px-3 py-0.5 font-mono text-sm',
                line.type === 'added' && 'text-dynamic-green',
                line.type === 'removed' && 'text-dynamic-red',
                line.type === 'unchanged' && 'text-foreground/80'
              )}
            >
              <span className="w-4 shrink-0 select-none text-center opacity-60">
                {line.type === 'added' && '+'}
                {line.type === 'removed' && '-'}
                {line.type === 'unchanged' && ' '}
              </span>
              <span
                className={cn(
                  'whitespace-pre-wrap break-all',
                  line.type === 'removed' && 'line-through'
                )}
              >
                {line.content || ' '}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MinimizedSplitDiffView({
  items,
  t,
  onToggleBlock,
  expandedBlocks,
}: {
  items: DiffDisplayItem[];
  t: (
    key: string,
    options?: { defaultValue?: string; count?: number }
  ) => string;
  onToggleBlock: (blockId: string) => void;
  expandedBlocks: Set<string>;
}) {
  const pairs = useMemo(() => {
    const result: Array<
      | {
          type: 'line';
          left: ProcessedLine | null;
          right: ProcessedLine | null;
          key: string;
        }
      | { type: 'collapsed'; id: string; count: number }
    > = [];

    let i = 0;
    while (i < items.length) {
      const item = items[i];

      if (!item) {
        i++;
        continue;
      }

      if ('id' in item && item.type === 'collapsed') {
        result.push({ type: 'collapsed', id: item.id, count: item.count });
        i++;
        continue;
      }

      const line = item as ProcessedLine;

      if (line.type === 'unchanged') {
        result.push({
          type: 'line',
          left: line,
          right: line,
          key: `line-${line.originalIndex}`,
        });
        i++;
      } else if (line.type === 'removed') {
        const next = items[i + 1];
        if (next && !('id' in next) && next.type === 'added') {
          result.push({
            type: 'line',
            left: line,
            right: next,
            key: `line-${line.originalIndex}-${next.originalIndex}`,
          });
          i += 2;
        } else {
          result.push({
            type: 'line',
            left: line,
            right: null,
            key: `line-${line.originalIndex}`,
          });
          i++;
        }
      } else if (line.type === 'added') {
        result.push({
          type: 'line',
          left: null,
          right: line,
          key: `line-${line.originalIndex}`,
        });
        i++;
      } else {
        i++;
      }
    }

    return result;
  }, [items]);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {/* Headers */}
      <div className="grid grid-cols-2 border-b bg-muted/50">
        <div className="border-r px-3 py-2 font-medium text-muted-foreground text-xs">
          {t('old_version', { defaultValue: 'Previous' })}
        </div>
        <div className="px-3 py-2 font-medium text-muted-foreground text-xs">
          {t('new_version', { defaultValue: 'Current' })}
        </div>
      </div>

      {/* Diff rows */}
      {pairs.map((pair) => {
        if (pair.type === 'collapsed') {
          return (
            <CollapsedLinesIndicator
              key={pair.id}
              blockId={pair.id}
              count={pair.count}
              t={t}
              onToggle={onToggleBlock}
              isExpanded={expandedBlocks.has(pair.id)}
            />
          );
        }

        return (
          <SplitDiffRow key={pair.key} left={pair.left} right={pair.right} />
        );
      })}
    </div>
  );
}

function LineNumber({
  value,
  type,
}: {
  value?: number;
  type?: 'added' | 'removed' | 'unchanged';
}) {
  return (
    <div
      className={cn(
        'w-12 shrink-0 select-none border-r px-2 py-0.5 text-right font-mono text-xs',
        type === 'added' &&
          'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green/60',
        type === 'removed' &&
          'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red/60',
        !type && 'bg-muted/50 text-muted-foreground/60'
      )}
    >
      {value || ''}
    </div>
  );
}

function CollapsedLinesIndicator({
  blockId,
  count,
  t,
  onToggle,
}: {
  blockId: string;
  count: number;
  t: (
    key: string,
    options?: { defaultValue?: string; count?: number }
  ) => string;
  onToggle: (blockId: string) => void;
  isExpanded: boolean;
}) {
  const label =
    count === 1
      ? t('line_hidden', { defaultValue: '1 unchanged line', count })
      : t('lines_hidden', {
          defaultValue: `${count} unchanged lines`,
          count,
        });

  return (
    <button
      type="button"
      onClick={() => onToggle(blockId)}
      className="group flex w-full items-center justify-center gap-2 border-y bg-muted/30 px-4 py-1.5 text-muted-foreground text-xs transition-colors hover:bg-muted/50"
    >
      <div className="h-px flex-1 bg-border" />
      <span className="flex items-center gap-1.5">
        <ChevronsUpDown className="h-3 w-3" />
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </button>
  );
}

function SplitDiffRow({
  left,
  right,
}: {
  left: ProcessedLine | null;
  right: ProcessedLine | null;
}) {
  return (
    <div className="grid grid-cols-2 border-border/50 border-b last:border-b-0">
      {/* Left side (old) */}
      <div
        className={cn(
          'flex min-h-7 border-r',
          left?.type === 'removed' && 'bg-dynamic-red/5',
          !left && 'bg-muted/20'
        )}
      >
        {left && (
          <>
            <LineNumber
              value={left.lineNumber.old}
              type={left.type === 'removed' ? 'removed' : undefined}
            />
            <div
              className={cn(
                'flex flex-1 items-start gap-2 px-3 py-0.5 font-mono text-sm',
                left.type === 'removed' && 'text-dynamic-red',
                left.type === 'unchanged' && 'text-foreground/80'
              )}
            >
              {left.type === 'removed' && (
                <span className="w-3 shrink-0 select-none text-center opacity-60">
                  -
                </span>
              )}
              <span
                className={cn(
                  'whitespace-pre-wrap break-all',
                  left.type === 'removed' && 'line-through'
                )}
              >
                {left.content || ' '}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Right side (new) */}
      <div
        className={cn(
          'flex min-h-7',
          right?.type === 'added' && 'bg-dynamic-green/5',
          !right && 'bg-muted/20'
        )}
      >
        {right && (
          <>
            <LineNumber
              value={right.lineNumber.new}
              type={right.type === 'added' ? 'added' : undefined}
            />
            <div
              className={cn(
                'flex flex-1 items-start gap-2 px-3 py-0.5 font-mono text-sm',
                right.type === 'added' && 'text-dynamic-green',
                right.type === 'unchanged' && 'text-foreground/80'
              )}
            >
              {right.type === 'added' && (
                <span className="w-3 shrink-0 select-none text-center opacity-60">
                  +
                </span>
              )}
              <span className="whitespace-pre-wrap break-all">
                {right.content || ' '}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Word diff types and helpers

interface WordDiffLine {
  lineIndex: number;
  hasChanges: boolean;
  segments: Array<{ type: 'added' | 'removed' | 'unchanged'; value: string }>;
}

function processWordDiffToLines(diff: DiffChange[]): WordDiffLine[] {
  const lines: WordDiffLine[] = [];
  let currentLineIndex = 0;
  let currentLineSegments: WordDiffLine['segments'] = [];
  let currentLineHasChanges = false;

  for (const change of diff) {
    const parts = change.value.split('\n');

    parts.forEach((part, partIndex) => {
      if (part.length > 0 || partIndex === 0) {
        currentLineSegments.push({ type: change.type, value: part });
        if (change.type !== 'unchanged') {
          currentLineHasChanges = true;
        }
      }

      if (partIndex < parts.length - 1) {
        lines.push({
          lineIndex: currentLineIndex,
          hasChanges: currentLineHasChanges,
          segments: currentLineSegments,
        });
        currentLineIndex++;
        currentLineSegments = [];
        currentLineHasChanges = false;
      }
    });
  }

  if (currentLineSegments.length > 0) {
    lines.push({
      lineIndex: currentLineIndex,
      hasChanges: currentLineHasChanges,
      segments: currentLineSegments,
    });
  }

  return lines;
}

interface WordDiffDisplayItem {
  type: 'line' | 'collapsed';
  line?: WordDiffLine;
  id?: string;
  count?: number;
}

function collapseUnchangedWordLines(
  lines: WordDiffLine[],
  contextLines: number,
  expandedBlocks: Set<string>
): WordDiffDisplayItem[] {
  if (lines.length === 0) return [];

  const changedIndices = lines
    .map((line, idx) => (line.hasChanges ? idx : -1))
    .filter((idx) => idx !== -1);

  if (changedIndices.length === 0) {
    const blockId = 'word-block-0';
    if (expandedBlocks.has(blockId)) {
      return lines.map((line) => ({ type: 'line' as const, line }));
    }
    return lines.length > 0
      ? [{ type: 'collapsed' as const, id: blockId, count: lines.length }]
      : [];
  }

  const visibleLines = new Set<number>();
  for (const changeIdx of changedIndices) {
    for (
      let i = Math.max(0, changeIdx - contextLines);
      i <= Math.min(lines.length - 1, changeIdx + contextLines);
      i++
    ) {
      visibleLines.add(i);
    }
  }

  const result: WordDiffDisplayItem[] = [];
  let collapsedStartIdx = -1;
  let collapsedCount = 0;
  let blockCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    if (visibleLines.has(i)) {
      if (collapsedCount > 0) {
        const blockId = `word-block-${blockCounter++}`;
        if (expandedBlocks.has(blockId)) {
          for (let j = collapsedStartIdx; j < i; j++) {
            result.push({ type: 'line', line: lines[j] });
          }
        } else {
          result.push({
            type: 'collapsed',
            id: blockId,
            count: collapsedCount,
          });
        }
        collapsedCount = 0;
        collapsedStartIdx = -1;
      }
      result.push({ type: 'line', line: lines[i] });
    } else {
      if (collapsedStartIdx === -1) {
        collapsedStartIdx = i;
      }
      collapsedCount++;
    }
  }

  if (collapsedCount > 0) {
    const blockId = `word-block-${blockCounter}`;
    if (expandedBlocks.has(blockId)) {
      for (let j = collapsedStartIdx; j < lines.length; j++) {
        result.push({ type: 'line', line: lines[j] });
      }
    } else {
      result.push({ type: 'collapsed', id: blockId, count: collapsedCount });
    }
  }

  return result;
}

interface WordDiffViewProps {
  diff: DiffChange[];
  oldText: string;
  newText: string;
  viewMode: DiffViewMode;
  t: (
    key: string,
    options?: { defaultValue?: string; count?: number }
  ) => string;
  expandedBlocks: Set<string>;
  onToggleBlock: (blockId: string) => void;
}

function WordDiffView({
  diff,
  oldText,
  newText,
  viewMode,
  t,
  expandedBlocks,
  onToggleBlock,
}: WordDiffViewProps) {
  const wordDiffLines = useMemo(() => processWordDiffToLines(diff), [diff]);

  const displayItems = useMemo(
    () =>
      collapseUnchangedWordLines(wordDiffLines, CONTEXT_LINES, expandedBlocks),
    [wordDiffLines, expandedBlocks]
  );

  if (viewMode === 'split') {
    return (
      <div className="overflow-hidden rounded-lg border bg-card">
        {/* Headers */}
        <div className="grid grid-cols-2 border-b bg-muted/50">
          <div className="border-r px-3 py-2 font-medium text-muted-foreground text-xs">
            {t('old_version', { defaultValue: 'Previous' })}
          </div>
          <div className="px-3 py-2 font-medium text-muted-foreground text-xs">
            {t('new_version', { defaultValue: 'Current' })}
          </div>
        </div>

        {displayItems.map((item) => {
          if (item.type === 'collapsed') {
            return (
              <CollapsedLinesIndicator
                key={item.id}
                blockId={item.id!}
                count={item.count!}
                t={t}
                onToggle={onToggleBlock}
                isExpanded={expandedBlocks.has(item.id!)}
              />
            );
          }

          const line = item.line!;
          return (
            <WordDiffSplitRow
              key={`line-${line.lineIndex}`}
              line={line}
              lineIndex={line.lineIndex}
            />
          );
        })}

        {!oldText && !newText && (
          <div className="py-8 text-center text-muted-foreground italic">
            {t('value.empty', { defaultValue: 'Empty' })}
          </div>
        )}
      </div>
    );
  }

  // Unified view
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {displayItems.map((item) => {
        if (item.type === 'collapsed') {
          return (
            <CollapsedLinesIndicator
              key={item.id}
              blockId={item.id!}
              count={item.count!}
              t={t}
              onToggle={onToggleBlock}
              isExpanded={expandedBlocks.has(item.id!)}
            />
          );
        }

        const line = item.line!;
        const hasAdditions = line.segments.some((s) => s.type === 'added');
        const hasRemovals = line.segments.some((s) => s.type === 'removed');

        return (
          <div
            key={`line-${line.lineIndex}`}
            className={cn(
              'flex min-h-6 border-border/50 border-b last:border-b-0',
              line.hasChanges && 'bg-muted/20'
            )}
          >
            <LineNumber
              value={line.lineIndex + 1}
              type={
                hasRemovals ? 'removed' : hasAdditions ? 'added' : undefined
              }
            />
            <div className="flex flex-1 items-start gap-2 px-3 py-0.5 font-mono text-sm">
              <span className="w-4 shrink-0 select-none text-center opacity-60">
                {line.hasChanges ? '*' : ' '}
              </span>
              <span className="whitespace-pre-wrap break-all">
                {line.segments.map((seg, segIdx) => (
                  <span
                    key={segIdx}
                    className={cn(
                      seg.type === 'added' &&
                        'rounded-sm bg-dynamic-green/20 text-dynamic-green',
                      seg.type === 'removed' &&
                        'rounded-sm bg-dynamic-red/20 text-dynamic-red line-through'
                    )}
                  >
                    {seg.value}
                  </span>
                ))}
              </span>
            </div>
          </div>
        );
      })}

      {!oldText && !newText && (
        <div className="py-8 text-center text-muted-foreground italic">
          {t('value.empty', { defaultValue: 'Empty' })}
        </div>
      )}
    </div>
  );
}

function WordDiffSplitRow({
  line,
  lineIndex,
}: {
  line: WordDiffLine;
  lineIndex: number;
}) {
  const leftSegments = line.segments.filter((s) => s.type !== 'added');
  const rightSegments = line.segments.filter((s) => s.type !== 'removed');

  const hasRemovals = line.segments.some((s) => s.type === 'removed');
  const hasAdditions = line.segments.some((s) => s.type === 'added');

  return (
    <div className="grid grid-cols-2 border-border/50 border-b last:border-b-0">
      {/* Left side (old) */}
      <div
        className={cn(
          'flex min-h-7 border-r',
          hasRemovals && 'bg-dynamic-red/5'
        )}
      >
        <LineNumber
          value={lineIndex + 1}
          type={hasRemovals ? 'removed' : undefined}
        />
        <div
          className={cn(
            'flex flex-1 items-start gap-2 px-3 py-0.5 font-mono text-sm',
            !line.hasChanges && 'text-foreground/80'
          )}
        >
          {hasRemovals && (
            <span className="w-3 shrink-0 select-none text-center text-dynamic-red/60">
              -
            </span>
          )}
          <span className="whitespace-pre-wrap break-all">
            {leftSegments.map((seg, idx) => (
              <span
                key={idx}
                className={cn(
                  seg.type === 'removed' &&
                    'rounded-sm bg-dynamic-red/20 text-dynamic-red line-through'
                )}
              >
                {seg.value}
              </span>
            ))}
          </span>
        </div>
      </div>

      {/* Right side (new) */}
      <div className={cn('flex min-h-7', hasAdditions && 'bg-dynamic-green/5')}>
        <LineNumber
          value={lineIndex + 1}
          type={hasAdditions ? 'added' : undefined}
        />
        <div
          className={cn(
            'flex flex-1 items-start gap-2 px-3 py-0.5 font-mono text-sm',
            !line.hasChanges && 'text-foreground/80'
          )}
        >
          {hasAdditions && (
            <span className="w-3 shrink-0 select-none text-center text-dynamic-green/60">
              +
            </span>
          )}
          <span className="whitespace-pre-wrap break-all">
            {rightSegments.map((seg, idx) => (
              <span
                key={idx}
                className={cn(
                  seg.type === 'added' &&
                    'rounded-sm bg-dynamic-green/20 text-dynamic-green'
                )}
              >
                {seg.value}
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

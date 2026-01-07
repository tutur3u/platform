'use client';

import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Columns2,
  Eye,
  FileText,
  FoldVertical,
  Image as ImageIcon,
  Minus,
  Pen,
  Plus,
  Rows2,
  Type,
  Video,
  WrapText,
  X,
  Youtube,
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
  computeNodeDiff,
  getNodeImageSrc,
  type NodeDiffResult,
  type NodeDiffSummary,
  parseJsonContent,
} from '@tuturuuu/utils/node-diff';
import {
  computeLineDiff,
  computeWordDiff,
  type DiffChange,
  getDiffStats,
} from '@tuturuuu/utils/text-diff';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import Image from 'next/image';
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

  // Compute node-level diff for media changes
  const nodeDiff = useMemo<NodeDiffSummary>(() => {
    const oldContent = parseJsonContent(oldValue);
    const newContent = parseJsonContent(newValue);
    return computeNodeDiff(oldContent, newContent);
  }, [oldValue, newValue]);

  if (!hasTextChanges && !hasRawValueChanges && nodeDiff.totalChanges === 0) {
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
        <DialogHeader className="border-b px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <DialogTitle className="text-sm sm:text-base">
              {t('description_changes', {
                defaultValue: 'Description Changes',
              })}
            </DialogTitle>
            {!noVisibleChanges && (
              <div className="flex w-full items-center justify-center gap-1 sm:w-auto sm:justify-start">
                {/* Granularity toggle */}
                <ToggleGroup
                  type="single"
                  value={granularity}
                  onValueChange={(v) =>
                    v && setGranularity(v as DiffGranularity)
                  }
                  className="h-7 sm:h-8"
                >
                  <ToggleGroupItem
                    value="word"
                    aria-label={t('word_diff', { defaultValue: 'Word' })}
                    className="h-6 gap-1 px-1.5 text-xs sm:h-7 sm:gap-1.5 sm:px-2.5"
                  >
                    <Type className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    {t('word_diff', { defaultValue: 'Word' })}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="line"
                    aria-label={t('line_diff', { defaultValue: 'Line' })}
                    className="h-6 gap-1 px-1.5 text-xs sm:h-7 sm:gap-1.5 sm:px-2.5"
                  >
                    <WrapText className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    {t('line_diff', { defaultValue: 'Line' })}
                  </ToggleGroupItem>
                </ToggleGroup>

                {/* View mode toggle - only show on sm+ screens */}
                <Separator
                  orientation="vertical"
                  className="mx-0.5 hidden h-4 sm:mx-1 sm:block sm:h-5"
                />

                <ToggleGroup
                  type="single"
                  value={viewMode}
                  onValueChange={(v) => v && setViewMode(v as DiffViewMode)}
                  className="hidden h-8 sm:flex"
                >
                  <ToggleGroupItem
                    value="unified"
                    aria-label={t('unified_view', { defaultValue: 'Unified' })}
                    className="h-7 gap-1.5 px-2.5 text-xs"
                  >
                    <Rows2 className="h-3.5 w-3.5" />
                    {t('unified_view', { defaultValue: 'Unified' })}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="split"
                    aria-label={t('split_view', { defaultValue: 'Split' })}
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
            <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5 sm:px-4 sm:py-2">
              <div className="flex items-center gap-2 sm:gap-3">
                <Badge
                  variant="outline"
                  className="gap-1 border-dynamic-green/30 bg-dynamic-green/10 px-1.5 py-0.5 text-dynamic-green text-xs sm:gap-1.5 sm:px-2.5 sm:py-0.5"
                >
                  <Plus className="h-3 w-3" />
                  {stats.added}{' '}
                  <span className="xs:inline hidden">
                    {t('lines_added', { defaultValue: 'added' })}
                  </span>
                </Badge>
                <Badge
                  variant="outline"
                  className="gap-1 border-dynamic-red/30 bg-dynamic-red/10 px-1.5 py-0.5 text-dynamic-red text-xs sm:gap-1.5 sm:px-2.5 sm:py-0.5"
                >
                  <Minus className="h-3 w-3" />
                  {stats.removed}{' '}
                  <span className="xs:inline hidden">
                    {t('lines_removed', { defaultValue: 'removed' })}
                  </span>
                </Badge>
              </div>
              {expandedBlocks.size > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-1.5 text-muted-foreground text-xs sm:h-7 sm:gap-1.5 sm:px-2"
                  onClick={() => setExpandedBlocks(new Set())}
                >
                  <FoldVertical className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">
                    {t('condense', { defaultValue: 'Condense' })}
                  </span>
                </Button>
              )}
            </div>

            {/* Diff view */}
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="space-y-3 p-2 sm:space-y-4 sm:p-4">
                {/* Media changes section (images, videos, etc.) */}
                {nodeDiff.hasMediaChanges && (
                  <MediaChangesSection nodeDiff={nodeDiff} t={t} />
                )}

                {/* Text diff section */}
                {hasTextChanges && (
                  <>
                    {nodeDiff.hasMediaChanges && (
                      <div className="flex items-center gap-2 pt-2">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-muted-foreground text-xs">
                          {t('text_changes', { defaultValue: 'Text Changes' })}
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
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
                  </>
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

// ============================================================================
// MEDIA CHANGES SECTION - Shows image/video/mention changes with thumbnails
// ============================================================================

interface MediaChangesSectionProps {
  nodeDiff: NodeDiffSummary;
  t: (
    key: string,
    options?: { defaultValue?: string; count?: number }
  ) => string;
}

function MediaChangesSection({ nodeDiff, t }: MediaChangesSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { added, removed, modified } = nodeDiff;

  // Filter to only show media nodes (images, videos, youtube)
  const mediaAdded = added.filter((d) =>
    ['image', 'imageResize', 'video', 'youtube'].includes(d.nodeType)
  );
  const mediaRemoved = removed.filter((d) =>
    ['image', 'imageResize', 'video', 'youtube'].includes(d.nodeType)
  );
  const mediaModified = modified.filter((d) =>
    ['image', 'imageResize', 'video', 'youtube'].includes(d.nodeType)
  );

  const totalCount =
    mediaAdded.length + mediaRemoved.length + mediaModified.length;

  if (totalCount === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-1.5 bg-muted/50 px-2 py-1.5 text-left transition-colors hover:bg-muted/70 sm:gap-2 sm:px-3 sm:py-2"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" />
        )}
        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" />
        <span className="font-medium text-xs sm:text-sm">
          {t('media_changes', { defaultValue: 'Media Changes' })}
        </span>
        <Badge variant="secondary" className="ml-auto text-xs">
          {totalCount}
        </Badge>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="divide-y border-t">
          {/* Removed items */}
          {mediaRemoved.map((diff, idx) => (
            <MediaChangeRow
              key={`removed-${idx}`}
              diff={diff}
              changeType="removed"
              t={t}
            />
          ))}

          {/* Added items */}
          {mediaAdded.map((diff, idx) => (
            <MediaChangeRow
              key={`added-${idx}`}
              diff={diff}
              changeType="added"
              t={t}
            />
          ))}

          {/* Modified items */}
          {mediaModified.map((diff, idx) => (
            <MediaChangeRow
              key={`modified-${idx}`}
              diff={diff}
              changeType="modified"
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface MediaChangeRowProps {
  diff: NodeDiffResult;
  changeType: 'added' | 'removed' | 'modified';
  t: (
    key: string,
    options?: { defaultValue?: string; count?: number }
  ) => string;
}

function MediaChangeRow({ diff, changeType, t }: MediaChangeRowProps) {
  const [imageError, setImageError] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const node = changeType === 'removed' ? diff.oldNode : diff.newNode;
  const imageSrc = node ? getNodeImageSrc(node) : null;
  const isImage = diff.nodeType === 'image' || diff.nodeType === 'imageResize';
  const isVideo = diff.nodeType === 'video';
  const isYoutube = diff.nodeType === 'youtube';

  // Get video source for preview
  const videoSrc = isVideo ? node?.attrs?.src : null;
  const youtubeSrc = isYoutube
    ? node?.attrs?.src || node?.attrs?.videoId
    : null;

  const getIcon = () => {
    if (isVideo) return <Video className="h-4 w-4" />;
    if (isYoutube) return <Youtube className="h-4 w-4" />;
    return <ImageIcon className="h-4 w-4" />;
  };

  const getLabel = () => {
    if (changeType === 'modified') {
      return t('media_modified', { defaultValue: 'Modified' });
    }
    if (changeType === 'added') {
      if (isImage) return t('image_added', { defaultValue: 'Image added' });
      if (isVideo) return t('video_added', { defaultValue: 'Video added' });
      if (isYoutube)
        return t('youtube_added', { defaultValue: 'YouTube added' });
      return t('media_added', { defaultValue: 'Added' });
    }
    // removed
    if (isImage) return t('image_removed', { defaultValue: 'Image removed' });
    if (isVideo) return t('video_removed', { defaultValue: 'Video removed' });
    if (isYoutube)
      return t('youtube_removed', { defaultValue: 'YouTube removed' });
    return t('media_removed', { defaultValue: 'Removed' });
  };

  const canPreview =
    (isImage && imageSrc && !imageError) || videoSrc || youtubeSrc;

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-1.5 sm:gap-3 sm:px-3 sm:py-2',
          changeType === 'added' && 'bg-dynamic-green/5',
          changeType === 'removed' && 'bg-dynamic-red/5',
          changeType === 'modified' && 'bg-dynamic-yellow/5'
        )}
      >
        {/* Change indicator */}
        <div
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full font-medium text-xs sm:h-5 sm:w-5',
            changeType === 'added' && 'bg-dynamic-green/20 text-dynamic-green',
            changeType === 'removed' && 'bg-dynamic-red/20 text-dynamic-red',
            changeType === 'modified' &&
              'bg-dynamic-yellow/20 text-dynamic-yellow'
          )}
        >
          {changeType === 'added' && (
            <Plus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          )}
          {changeType === 'removed' && (
            <Minus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          )}
          {changeType === 'modified' && (
            <Pen className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          )}
        </div>

        {/* Thumbnail - clickable for preview */}
        <button
          type="button"
          onClick={() => canPreview && setShowPreview(true)}
          disabled={!canPreview}
          className={cn(
            'relative h-10 w-10 shrink-0 overflow-hidden rounded-md border-2 transition-transform sm:h-12 sm:w-12',
            changeType === 'added' && 'border-dynamic-green/30',
            changeType === 'removed' && 'border-dynamic-red/30 opacity-60',
            changeType === 'modified' && 'border-dynamic-yellow/30',
            canPreview &&
              'cursor-pointer hover:scale-105 hover:ring-2 hover:ring-primary/50'
          )}
        >
          {isImage && imageSrc && !imageError ? (
            <Image
              src={imageSrc}
              alt={diff.displayLabel}
              height={48}
              width={48}
              className="h-full w-full object-cover"
              onError={() => setImageError(true)}
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
              {getIcon()}
            </div>
          )}
          {canPreview && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity hover:bg-black/20 hover:opacity-100">
              <Eye className="h-4 w-4 text-white" />
            </div>
          )}
        </button>

        {/* Label and details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'font-medium text-[10px] sm:text-xs',
                changeType === 'added' && 'text-dynamic-green',
                changeType === 'removed' && 'text-dynamic-red',
                changeType === 'modified' && 'text-dynamic-yellow'
              )}
            >
              {getLabel()}
            </span>
          </div>
          <p className="truncate text-foreground/80 text-xs sm:text-sm">
            {diff.displayLabel}
          </p>

          {/* Show attribute changes for modified items - hidden on small screens */}
          {changeType === 'modified' && diff.attributeChanges && (
            <div className="mt-1 hidden flex-wrap gap-1 sm:flex">
              {diff.attributeChanges.slice(0, 3).map((change, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs"
                >
                  <span className="font-medium">{change.key}:</span>
                  <span className="line-through opacity-60">
                    {formatAttrValue(change.oldValue)}
                  </span>
                  <span>→</span>
                  <span>{formatAttrValue(change.newValue)}</span>
                </span>
              ))}
              {diff.attributeChanges.length > 3 && (
                <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
                  +{diff.attributeChanges.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full-screen preview dialog */}
      {showPreview && canPreview && (
        <MediaPreviewDialog
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          src={imageSrc || videoSrc || youtubeSrc || ''}
          type={isImage ? 'image' : isVideo ? 'video' : 'youtube'}
          label={diff.displayLabel}
          t={t}
        />
      )}
    </>
  );
}

// ============================================================================
// MEDIA PREVIEW DIALOG - Full-screen preview for media items
// ============================================================================

interface MediaPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  type: 'image' | 'video' | 'youtube';
  label: string;
  t: (
    key: string,
    options?: { defaultValue?: string; count?: number }
  ) => string;
}

function MediaPreviewDialog({
  isOpen,
  onClose,
  src,
  type,
  label,
  t,
}: MediaPreviewDialogProps) {
  const [imageError, setImageError] = useState(false);

  if (!isOpen) return null;

  // Extract YouTube video ID from URL
  const getYoutubeEmbedUrl = (url: string) => {
    try {
      // Handle various YouTube URL formats
      const urlObj = new URL(url);
      let videoId = urlObj.searchParams.get('v');
      if (!videoId) {
        // Handle youtu.be or embed URLs
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        videoId = pathParts[pathParts.length - 1] || null;
      }
      return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
    } catch {
      // If it's just a video ID, use it directly
      return `https://www.youtube.com/embed/${src}`;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="flex h-[95vh] max-h-[95vh] w-[98vw] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:h-[90vh] sm:max-h-[90vh] sm:w-[95vw] md:max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90vw]"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="flex-row items-center justify-between border-b px-2 py-2 sm:px-4 sm:py-3">
          <DialogTitle className="flex items-center gap-1.5 text-sm sm:gap-2 sm:text-base">
            {type === 'image' && (
              <ImageIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            )}
            {type === 'video' && (
              <Video className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            )}
            {type === 'youtube' && (
              <Youtube className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            )}
            <span className="xs:inline hidden">
              {t('media_preview', { defaultValue: 'Media Preview' })}
            </span>
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 sm:h-8 sm:w-8"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">
              {t('close_preview', { defaultValue: 'Close preview' })}
            </span>
          </Button>
        </DialogHeader>

        {/* Preview content */}
        <div className="flex flex-1 items-center justify-center overflow-auto bg-black/5 p-2 sm:p-4">
          {type === 'image' && !imageError && (
            <Image
              src={src}
              alt={label}
              height={512}
              width={512}
              className="max-h-full max-w-full rounded-lg object-contain shadow-lg"
              onError={() => setImageError(true)}
            />
          )}
          {type === 'image' && imageError && (
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
              <ImageIcon className="h-12 w-12 sm:h-16 sm:w-16" />
              <p className="text-xs sm:text-sm">Failed to load image</p>
            </div>
          )}
          {type === 'video' && (
            <video
              src={src}
              controls
              className="max-h-full max-w-full rounded-lg shadow-lg"
            >
              Your browser does not support the video tag.
            </video>
          )}
          {type === 'youtube' && (
            <iframe
              src={getYoutubeEmbedUrl(src)}
              title={label}
              className="aspect-video h-auto w-full max-w-4xl rounded-lg shadow-lg"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
        </div>

        {/* Footer with label */}
        <div className="border-t bg-muted/30 px-2 py-1.5 sm:px-4 sm:py-2">
          <p className="truncate text-center text-muted-foreground text-xs sm:text-sm">
            {label}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Format attribute value for display
 */
function formatAttrValue(value: unknown): string {
  if (value === null || value === undefined) return 'none';
  if (typeof value === 'string') {
    return value.length > 20 ? `${value.slice(0, 17)}...` : value;
  }
  if (typeof value === 'number') {
    // Round to 2 decimal places if needed
    const rounded = Math.round(value * 100) / 100;
    return String(rounded);
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return JSON.stringify(value).slice(0, 20);
}

'use client';

import {
  ChevronsUpDown,
  Columns2,
  Eye,
  FileText,
  Minus,
  Plus,
  Rows2,
  Type,
  UnfoldVertical,
  WrapText,
} from '@tuturuuu/icons';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
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

interface DescriptionDiffViewerProps {
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
    // Add the changed line and context around it
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
      // Output any accumulated collapsed lines
      if (collapsedCount > 0) {
        const blockId = `block-${blockCounter++}`;
        if (expandedBlocks.has(blockId)) {
          // Show all the collapsed lines
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

  // Don't forget trailing collapsed lines
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

  // Process diff into lines for minimized view
  const processedLines = useMemo(() => processDiffToLines(diff), [diff]);
  const minimizedDiff = useMemo(
    () => collapseUnchangedLines(processedLines, CONTEXT_LINES, expandedBlocks),
    [processedLines, expandedBlocks]
  );

  // Check if there are actual changes - either in extracted text or raw values
  const hasTextChanges = lineDiff.some((d) => d.type !== 'unchanged');

  // Also check if raw values are different (handles cases where extracted text is same but structure differs)
  const hasRawValueChanges = useMemo(() => {
    // If both are null/undefined, no change
    if (!oldValue && !newValue) return false;
    // If one exists and other doesn't, there's a change
    if (!oldValue || !newValue) return true;
    // Compare stringified values for structural changes
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

  // Show if there are text changes OR if raw values differ (content was added/removed)
  if (!hasTextChanges && !hasRawValueChanges) {
    return null;
  }

  const defaultTrigger =
    triggerVariant === 'inline' ? (
      <button
        type="button"
        className="inline-flex items-center gap-1 text-dynamic-blue text-xs hover:underline"
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

  // Check if there are no visible text changes (only structural/format changes)
  const noVisibleChanges = !hasTextChanges && hasRawValueChanges;

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
            {!noVisibleChanges && (
              <div className="flex items-center gap-2">
                {/* Granularity toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={granularity === 'word' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-8 gap-1.5 px-2.5"
                      onClick={() =>
                        setGranularity((g) => (g === 'line' ? 'word' : 'line'))
                      }
                    >
                      {granularity === 'word' ? (
                        <Type className="h-3.5 w-3.5" />
                      ) : (
                        <WrapText className="h-3.5 w-3.5" />
                      )}
                      <span className="text-xs">
                        {granularity === 'word'
                          ? t('word_diff', { defaultValue: 'Word' })
                          : t('line_diff', { defaultValue: 'Line' })}
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {granularity === 'word'
                      ? t('switch_to_line_diff', {
                          defaultValue: 'Switch to line-level diff',
                        })
                      : t('switch_to_word_diff', {
                          defaultValue: 'Switch to word-level diff',
                        })}
                  </TooltipContent>
                </Tooltip>
                {/* View mode tabs */}
                <Tabs
                  value={viewMode}
                  onValueChange={(v) => setViewMode(v as DiffViewMode)}
                >
                  <TabsList className="h-8">
                    <TabsTrigger
                      value="unified"
                      className="gap-1.5 px-2.5 text-xs"
                    >
                      <Rows2 className="h-3.5 w-3.5" />
                      {t('unified_view', { defaultValue: 'Unified' })}
                    </TabsTrigger>
                    <TabsTrigger
                      value="split"
                      className="gap-1.5 px-2.5 text-xs"
                    >
                      <Columns2 className="h-3.5 w-3.5" />
                      {t('split_view', { defaultValue: 'Split' })}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}
          </div>
        </DialogHeader>

        {noVisibleChanges ? (
          // Show message when there are no visible text changes
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground">
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
            <div className="flex gap-4 border-b pb-2 text-sm">
              <span className="flex items-center gap-1 text-dynamic-green">
                <Plus className="h-3 w-3" />
                {stats.added} {t('lines_added', { defaultValue: 'added' })}
              </span>
              <span className="flex items-center gap-1 text-dynamic-red">
                <Minus className="h-3 w-3" />
                {stats.removed}{' '}
                {t('lines_removed', { defaultValue: 'removed' })}
              </span>
            </div>

            {/* Diff view */}
            <ScrollArea className="h-[50vh] md:h-[60vh] lg:h-[70vh]">
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
                  processedLines={processedLines}
                  t={t}
                  onToggleBlock={toggleBlock}
                  expandedBlocks={expandedBlocks}
                />
              )}
            </ScrollArea>
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
    <div className="space-y-0.5 font-mono text-sm">
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
          return null;
        }

        return (
          <div
            key={`line-${line.originalIndex}`}
            className={cn(
              'whitespace-pre-wrap rounded px-2 py-0.5',
              line.type === 'added' && 'bg-dynamic-green/10 text-dynamic-green',
              line.type === 'removed' &&
                'bg-dynamic-red/10 text-dynamic-red line-through',
              line.type === 'unchanged' && 'text-muted-foreground'
            )}
          >
            <span className="mr-2 inline-block w-4 text-right opacity-50">
              {line.type === 'added' && '+'}
              {line.type === 'removed' && '-'}
              {line.type === 'unchanged' && ' '}
            </span>
            {line.content || ' '}
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
  processedLines: ProcessedLine[];
  t: (
    key: string,
    options?: { defaultValue?: string; count?: number }
  ) => string;
  onToggleBlock: (blockId: string) => void;
  expandedBlocks: Set<string>;
}) {
  // Create pairs for split view from minimized items
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
        // Check if next is added (paired change)
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
    <div className="grid grid-cols-2 gap-0.5">
      {/* Headers */}
      <div className="sticky top-0 z-10 border-b bg-muted/80 px-3 py-1.5 font-medium text-muted-foreground text-xs backdrop-blur">
        {t('old_version', { defaultValue: 'Previous' })}
      </div>
      <div className="sticky top-0 z-10 border-b bg-muted/80 px-3 py-1.5 font-medium text-muted-foreground text-xs backdrop-blur">
        {t('new_version', { defaultValue: 'Current' })}
      </div>

      {/* Diff rows */}
      {pairs.map((pair) => {
        if (pair.type === 'collapsed') {
          return (
            <div key={pair.id} className="col-span-2">
              <CollapsedLinesIndicator
                blockId={pair.id}
                count={pair.count}
                t={t}
                onToggle={onToggleBlock}
                isExpanded={expandedBlocks.has(pair.id)}
              />
            </div>
          );
        }

        return (
          <SplitDiffRow key={pair.key} left={pair.left} right={pair.right} />
        );
      })}
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
      ? t('line_hidden', { defaultValue: '1 unchanged line hidden', count })
      : t('lines_hidden', {
          defaultValue: `{count} unchanged lines hidden`,
          count,
        });

  return (
    <button
      type="button"
      onClick={() => onToggle(blockId)}
      className="my-1 flex w-full items-center gap-2 rounded bg-muted/50 px-3 py-1.5 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
    >
      <UnfoldVertical className="h-3 w-3" />
      <span className="flex-1 text-left">{label}</span>
      <ChevronsUpDown className="h-3 w-3" />
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
    <>
      {/* Left side (old) */}
      <div
        className={cn(
          'min-h-6 whitespace-pre-wrap border-r px-3 py-0.5 font-mono text-sm',
          left?.type === 'removed' && 'bg-dynamic-red/10 text-dynamic-red',
          left?.type === 'unchanged' && 'text-muted-foreground',
          !left && 'bg-muted/30'
        )}
      >
        {left && (
          <div className={left.type === 'removed' ? 'line-through' : ''}>
            {left.type === 'removed' && (
              <span className="mr-2 inline-block w-3 text-right opacity-50">
                -
              </span>
            )}
            {left.content || ' '}
          </div>
        )}
      </div>

      {/* Right side (new) */}
      <div
        className={cn(
          'min-h-6 whitespace-pre-wrap px-3 py-0.5 font-mono text-sm',
          right?.type === 'added' && 'bg-dynamic-green/10 text-dynamic-green',
          right?.type === 'unchanged' && 'text-muted-foreground',
          !right && 'bg-muted/30'
        )}
      >
        {right && (
          <div>
            {right.type === 'added' && (
              <span className="mr-2 inline-block w-3 text-right opacity-50">
                +
              </span>
            )}
            {right.content || ' '}
          </div>
        )}
      </div>
    </>
  );
}

interface WordDiffLine {
  lineIndex: number;
  hasChanges: boolean;
  segments: Array<{ type: 'added' | 'removed' | 'unchanged'; value: string }>;
}

/**
 * Process word diff into lines with word-level segments
 */
function processWordDiffToLines(diff: DiffChange[]): WordDiffLine[] {
  const lines: WordDiffLine[] = [];
  let currentLineIndex = 0;
  let currentLineSegments: WordDiffLine['segments'] = [];
  let currentLineHasChanges = false;

  for (const change of diff) {
    const parts = change.value.split('\n');

    parts.forEach((part, partIndex) => {
      // Add the text segment to current line
      if (part.length > 0 || partIndex === 0) {
        currentLineSegments.push({ type: change.type, value: part });
        if (change.type !== 'unchanged') {
          currentLineHasChanges = true;
        }
      }

      // If not the last part, we have a newline - finish current line
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

  // Don't forget the last line if it has content
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
  // For line type
  line?: WordDiffLine;
  // For collapsed type
  id?: string;
  count?: number;
}

/**
 * Collapse unchanged lines in word diff, keeping context around changes
 */
function collapseUnchangedWordLines(
  lines: WordDiffLine[],
  contextLines: number,
  expandedBlocks: Set<string>
): WordDiffDisplayItem[] {
  if (lines.length === 0) return [];

  // Find indices of all changed lines
  const changedIndices = lines
    .map((line, idx) => (line.hasChanges ? idx : -1))
    .filter((idx) => idx !== -1);

  // If no changes, show a collapsed indicator for all lines
  if (changedIndices.length === 0) {
    const blockId = 'word-block-0';
    if (expandedBlocks.has(blockId)) {
      return lines.map((line) => ({ type: 'line' as const, line }));
    }
    return lines.length > 0
      ? [{ type: 'collapsed' as const, id: blockId, count: lines.length }]
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
  const result: WordDiffDisplayItem[] = [];
  let collapsedStartIdx = -1;
  let collapsedCount = 0;
  let blockCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    if (visibleLines.has(i)) {
      // Output any accumulated collapsed lines
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

  // Don't forget trailing collapsed lines
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
  // Process word diff into lines
  const wordDiffLines = useMemo(() => processWordDiffToLines(diff), [diff]);

  // Apply collapsing
  const displayItems = useMemo(
    () =>
      collapseUnchangedWordLines(wordDiffLines, CONTEXT_LINES, expandedBlocks),
    [wordDiffLines, expandedBlocks]
  );

  if (viewMode === 'split') {
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
        {displayItems.map((item) => {
          if (item.type === 'collapsed') {
            return (
              <div key={item.id} className="col-span-2">
                <CollapsedLinesIndicator
                  blockId={item.id!}
                  count={item.count!}
                  t={t}
                  onToggle={onToggleBlock}
                  isExpanded={expandedBlocks.has(item.id!)}
                />
              </div>
            );
          }

          const line = item.line!;
          return (
            <WordDiffSplitRow key={`line-${line.lineIndex}`} line={line} />
          );
        })}

        {/* Empty state */}
        {!oldText && !newText && (
          <div className="col-span-2 py-4 text-center text-muted-foreground italic">
            {t('value.empty', { defaultValue: 'Empty' })}
          </div>
        )}
      </div>
    );
  }

  // Unified view
  return (
    <div className="space-y-0.5 font-mono text-sm">
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
          <div
            key={`line-${line.lineIndex}`}
            className={cn(
              'whitespace-pre-wrap rounded px-2 py-0.5',
              line.hasChanges ? 'bg-muted/30' : 'text-muted-foreground'
            )}
          >
            <span className="mr-2 inline-block w-4 text-right opacity-50">
              {line.hasChanges ? '*' : ' '}
            </span>
            {line.segments.map((seg, segIdx) => (
              <span
                key={segIdx}
                className={cn(
                  seg.type === 'added' &&
                    'bg-dynamic-green/10 text-dynamic-green',
                  seg.type === 'removed' &&
                    'bg-dynamic-red/10 text-dynamic-red line-through'
                )}
              >
                {seg.value}
              </span>
            ))}
            {line.segments.length === 0 && ' '}
          </div>
        );
      })}

      {/* Empty state */}
      {!oldText && !newText && (
        <div className="py-4 text-center text-muted-foreground italic">
          {t('value.empty', { defaultValue: 'Empty' })}
        </div>
      )}
    </div>
  );
}

function WordDiffSplitRow({ line }: { line: WordDiffLine }) {
  // For split view, we show:
  // - Left side: unchanged + removed segments
  // - Right side: unchanged + added segments
  const leftSegments = line.segments.filter((s) => s.type !== 'added');
  const rightSegments = line.segments.filter((s) => s.type !== 'removed');

  const hasRemovals = line.segments.some((s) => s.type === 'removed');
  const hasAdditions = line.segments.some((s) => s.type === 'added');

  return (
    <>
      {/* Left side (old) */}
      <div
        className={cn(
          'min-h-6 whitespace-pre-wrap border-r px-3 py-0.5 font-mono text-sm',
          hasRemovals && 'bg-dynamic-red/10',
          !line.hasChanges && 'text-muted-foreground'
        )}
      >
        {hasRemovals && (
          <span className="mr-2 inline-block w-3 text-right opacity-50">-</span>
        )}
        {leftSegments.map((seg, idx) => (
          <span
            key={idx}
            className={cn(
              seg.type === 'removed' && 'text-dynamic-red line-through'
            )}
          >
            {seg.value}
          </span>
        ))}
        {leftSegments.length === 0 && ' '}
      </div>

      {/* Right side (new) */}
      <div
        className={cn(
          'min-h-6 whitespace-pre-wrap px-3 py-0.5 font-mono text-sm',
          hasAdditions && 'bg-dynamic-green/10',
          !line.hasChanges && 'text-muted-foreground'
        )}
      >
        {hasAdditions && (
          <span className="mr-2 inline-block w-3 text-right opacity-50">+</span>
        )}
        {rightSegments.map((seg, idx) => (
          <span
            key={idx}
            className={cn(seg.type === 'added' && 'text-dynamic-green')}
          >
            {seg.value}
          </span>
        ))}
        {rightSegments.length === 0 && ' '}
      </div>
    </>
  );
}

'use client';

import {
  ChevronsUpDown,
  Columns2,
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
import { useCallback, useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export interface DiffViewerProps {
  oldValue: string | null | undefined;
  newValue: string | null | undefined;
  /** Label shown above old value column */
  oldLabel?: string;
  /** Label shown above new value column */
  newLabel?: string;
  /** Display mode: unified (interleaved), split (side-by-side), or inline (word-level highlight only) */
  viewMode?: 'unified' | 'split' | 'inline';
  /** Diff granularity */
  granularity?: 'word' | 'line';
  /** How to wrap the diff output */
  wrapper?: 'dialog' | 'inline' | 'none';
  /** Dialog title (only used when wrapper='dialog') */
  dialogTitle?: string;
  /** Custom trigger element (only used when wrapper='dialog') */
  trigger?: React.ReactNode;
  /** Show line numbers */
  showLineNumbers?: boolean;
  /** Collapse unchanged regions */
  collapsible?: boolean;
  /** Lines of context around changes when collapsible is true */
  contextLines?: number;
  /** className for root container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

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
}

type DisplayItem = ProcessedLine | CollapsedBlock;

interface WordDiffLine {
  lineIndex: number;
  hasChanges: boolean;
  segments: Array<{ type: 'added' | 'removed' | 'unchanged'; value: string }>;
}

interface WordDisplayItem {
  type: 'line' | 'collapsed';
  line?: WordDiffLine;
  id?: string;
  count?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function processDiffToLines(diff: DiffChange[]): ProcessedLine[] {
  const lines: ProcessedLine[] = [];
  let oldLineNum = 1;
  let newLineNum = 1;
  let originalIndex = 0;

  for (const change of diff) {
    const changeLines = change.value.split('\n');
    if (changeLines[changeLines.length - 1] === '') changeLines.pop();

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
      } else {
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

function collapseLines(
  lines: ProcessedLine[],
  contextLines: number,
  expandedBlocks: Set<string>
): DisplayItem[] {
  if (lines.length === 0) return [];

  const changedIndices = lines
    .map((line, idx) => (line.type !== 'unchanged' ? idx : -1))
    .filter((idx) => idx !== -1);

  if (changedIndices.length === 0) {
    const blockId = 'block-0';
    if (expandedBlocks.has(blockId)) return lines;
    return [{ type: 'collapsed', id: blockId, count: lines.length }];
  }

  const visible = new Set<number>();
  for (const ci of changedIndices) {
    for (
      let i = Math.max(0, ci - contextLines);
      i <= Math.min(lines.length - 1, ci + contextLines);
      i++
    ) {
      visible.add(i);
    }
  }

  const result: DisplayItem[] = [];
  let colStart = -1;
  let colCount = 0;
  let blockCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    if (visible.has(i)) {
      if (colCount > 0) {
        const blockId = `block-${blockCounter++}`;
        if (expandedBlocks.has(blockId)) {
          for (let j = colStart; j < i; j++) result.push(lines[j]!);
        } else {
          result.push({ type: 'collapsed', id: blockId, count: colCount });
        }
        colCount = 0;
        colStart = -1;
      }
      result.push(lines[i]!);
    } else {
      if (colStart === -1) colStart = i;
      colCount++;
    }
  }

  if (colCount > 0) {
    const blockId = `block-${blockCounter}`;
    if (expandedBlocks.has(blockId)) {
      for (let j = colStart; j < lines.length; j++) result.push(lines[j]!);
    } else {
      result.push({ type: 'collapsed', id: blockId, count: colCount });
    }
  }

  return result;
}

function processWordDiffLines(diff: DiffChange[]): WordDiffLine[] {
  const lines: WordDiffLine[] = [];
  let lineIdx = 0;
  let segments: WordDiffLine['segments'] = [];
  let hasChanges = false;

  for (const change of diff) {
    const parts = change.value.split('\n');
    parts.forEach((part, pi) => {
      if (part.length > 0 || pi === 0) {
        segments.push({ type: change.type, value: part });
        if (change.type !== 'unchanged') hasChanges = true;
      }
      if (pi < parts.length - 1) {
        lines.push({ lineIndex: lineIdx, hasChanges: hasChanges, segments });
        lineIdx++;
        segments = [];
        hasChanges = false;
      }
    });
  }

  if (segments.length > 0) {
    lines.push({ lineIndex: lineIdx, hasChanges, segments });
  }

  return lines;
}

function collapseWordLines(
  lines: WordDiffLine[],
  contextLines: number,
  expandedBlocks: Set<string>
): WordDisplayItem[] {
  if (lines.length === 0) return [];

  const changedIdx = lines
    .map((l, i) => (l.hasChanges ? i : -1))
    .filter((i) => i !== -1);

  if (changedIdx.length === 0) {
    const id = 'wblock-0';
    if (expandedBlocks.has(id))
      return lines.map((line) => ({ type: 'line' as const, line }));
    return [{ type: 'collapsed', id, count: lines.length }];
  }

  const visible = new Set<number>();
  for (const ci of changedIdx) {
    for (
      let i = Math.max(0, ci - contextLines);
      i <= Math.min(lines.length - 1, ci + contextLines);
      i++
    ) {
      visible.add(i);
    }
  }

  const result: WordDisplayItem[] = [];
  let colStart = -1;
  let colCount = 0;
  let bc = 0;

  for (let i = 0; i < lines.length; i++) {
    if (visible.has(i)) {
      if (colCount > 0) {
        const id = `wblock-${bc++}`;
        if (expandedBlocks.has(id)) {
          for (let j = colStart; j < i; j++)
            result.push({ type: 'line', line: lines[j] });
        } else {
          result.push({ type: 'collapsed', id, count: colCount });
        }
        colCount = 0;
        colStart = -1;
      }
      result.push({ type: 'line', line: lines[i] });
    } else {
      if (colStart === -1) colStart = i;
      colCount++;
    }
  }

  if (colCount > 0) {
    const id = `wblock-${bc}`;
    if (expandedBlocks.has(id)) {
      for (let j = colStart; j < lines.length; j++)
        result.push({ type: 'line', line: lines[j] });
    } else {
      result.push({ type: 'collapsed', id, count: colCount });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
        'w-10 shrink-0 select-none border-r px-1.5 py-0.5 text-right font-mono text-xs',
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

function CollapsedIndicator({
  blockId,
  count,
  onToggle,
}: {
  blockId: string;
  count: number;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(blockId)}
      className="group flex w-full items-center justify-center gap-2 border-y bg-muted/30 px-4 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted/50"
    >
      <div className="h-px flex-1 bg-border" />
      <span className="flex items-center gap-1.5">
        <ChevronsUpDown className="h-3 w-3" />
        {count} unchanged {count === 1 ? 'line' : 'lines'}
      </span>
      <div className="h-px flex-1 bg-border" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// View renderers
// ---------------------------------------------------------------------------

function UnifiedView({
  items,
  showLineNumbers,
  onToggle,
}: {
  items: DisplayItem[];
  showLineNumbers: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {items.map((item) => {
        if ('id' in item && item.type === 'collapsed') {
          return (
            <CollapsedIndicator
              key={item.id}
              blockId={item.id}
              count={item.count}
              onToggle={onToggle}
            />
          );
        }
        const line = item as ProcessedLine;
        return (
          <div
            key={`u-${line.originalIndex}`}
            className={cn(
              'flex min-h-6 border-border/50 border-b last:border-b-0',
              line.type === 'added' && 'bg-dynamic-green/5',
              line.type === 'removed' && 'bg-dynamic-red/5'
            )}
          >
            {showLineNumbers && (
              <LineNumber
                value={line.lineNumber.old || line.lineNumber.new}
                type={line.type}
              />
            )}
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

function SplitView({
  items,
  showLineNumbers,
  onToggle,
  oldLabel,
  newLabel,
}: {
  items: DisplayItem[];
  showLineNumbers: boolean;
  onToggle: (id: string) => void;
  oldLabel: string;
  newLabel: string;
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
          key: `s-${line.originalIndex}`,
        });
        i++;
      } else if (line.type === 'removed') {
        const next = items[i + 1];
        if (next && !('id' in next) && next.type === 'added') {
          result.push({
            type: 'line',
            left: line,
            right: next,
            key: `s-${line.originalIndex}-${next.originalIndex}`,
          });
          i += 2;
        } else {
          result.push({
            type: 'line',
            left: line,
            right: null,
            key: `s-${line.originalIndex}`,
          });
          i++;
        }
      } else {
        result.push({
          type: 'line',
          left: null,
          right: line,
          key: `s-${line.originalIndex}`,
        });
        i++;
      }
    }
    return result;
  }, [items]);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-2 border-b bg-muted/50">
        <div className="border-r px-3 py-2 font-medium text-muted-foreground text-xs">
          {oldLabel}
        </div>
        <div className="px-3 py-2 font-medium text-muted-foreground text-xs">
          {newLabel}
        </div>
      </div>
      {pairs.map((pair) => {
        if (pair.type === 'collapsed') {
          return (
            <CollapsedIndicator
              key={pair.id}
              blockId={pair.id}
              count={pair.count}
              onToggle={onToggle}
            />
          );
        }
        return (
          <div
            key={pair.key}
            className="grid grid-cols-2 border-border/50 border-b last:border-b-0"
          >
            <SplitSide
              line={pair.left}
              side="old"
              showLineNumbers={showLineNumbers}
            />
            <SplitSide
              line={pair.right}
              side="new"
              showLineNumbers={showLineNumbers}
            />
          </div>
        );
      })}
    </div>
  );
}

function SplitSide({
  line,
  side,
  showLineNumbers,
}: {
  line: ProcessedLine | null;
  side: 'old' | 'new';
  showLineNumbers: boolean;
}) {
  const isOld = side === 'old';
  return (
    <div
      className={cn(
        'flex min-h-7',
        isOld && 'border-r',
        line?.type === 'removed' && 'bg-dynamic-red/5',
        line?.type === 'added' && 'bg-dynamic-green/5',
        !line && 'bg-muted/20'
      )}
    >
      {line && (
        <>
          {showLineNumbers && (
            <LineNumber
              value={isOld ? line.lineNumber.old : line.lineNumber.new}
              type={
                line.type === 'removed'
                  ? 'removed'
                  : line.type === 'added'
                    ? 'added'
                    : undefined
              }
            />
          )}
          <div
            className={cn(
              'flex flex-1 items-start gap-2 px-3 py-0.5 font-mono text-sm',
              line.type === 'removed' && 'text-dynamic-red',
              line.type === 'added' && 'text-dynamic-green',
              line.type === 'unchanged' && 'text-foreground/80'
            )}
          >
            {line.type === 'removed' && (
              <span className="w-3 shrink-0 select-none text-center opacity-60">
                -
              </span>
            )}
            {line.type === 'added' && (
              <span className="w-3 shrink-0 select-none text-center opacity-60">
                +
              </span>
            )}
            <span
              className={cn(
                'whitespace-pre-wrap break-all',
                line.type === 'removed' && 'line-through'
              )}
            >
              {line.content || ' '}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function InlineWordView({
  items,
  showLineNumbers,
  onToggle,
}: {
  items: WordDisplayItem[];
  showLineNumbers: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {items.map((item) => {
        if (item.type === 'collapsed') {
          return (
            <CollapsedIndicator
              key={item.id}
              blockId={item.id!}
              count={item.count!}
              onToggle={onToggle}
            />
          );
        }
        const line = item.line!;
        const hasRemovals = line.segments.some((s) => s.type === 'removed');
        const hasAdditions = line.segments.some((s) => s.type === 'added');

        return (
          <div
            key={`iw-${line.lineIndex}`}
            className={cn(
              'flex min-h-6 border-border/50 border-b last:border-b-0',
              line.hasChanges && 'bg-muted/20'
            )}
          >
            {showLineNumbers && (
              <LineNumber
                value={line.lineIndex + 1}
                type={
                  hasRemovals ? 'removed' : hasAdditions ? 'added' : undefined
                }
              />
            )}
            <div className="flex flex-1 items-start gap-2 px-3 py-0.5 font-mono text-sm">
              <span className="w-4 shrink-0 select-none text-center opacity-60">
                {line.hasChanges ? '*' : ' '}
              </span>
              <span className="whitespace-pre-wrap break-all">
                {line.segments.map((seg, si) => (
                  <span
                    key={si}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function DiffViewerContent({
  oldValue,
  newValue,
  oldLabel = 'Previous',
  newLabel = 'Current',
  viewMode: initialViewMode = 'unified',
  granularity: initialGranularity = 'word',
  showLineNumbers = true,
  collapsible = true,
  contextLines = 3,
  className,
}: Omit<DiffViewerProps, 'wrapper' | 'dialogTitle' | 'trigger'>) {
  const oldText = oldValue ?? '';
  const newText = newValue ?? '';

  const [viewMode, setViewMode] = useState(initialViewMode);
  const [granularity, setGranularity] = useState(initialGranularity);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());

  const toggleBlock = useCallback((id: string) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const lineDiff = useMemo(
    () => computeLineDiff(oldText, newText),
    [oldText, newText]
  );
  const wordDiff = useMemo(
    () => computeWordDiff(oldText, newText),
    [oldText, newText]
  );
  const stats = useMemo(() => getDiffStats(lineDiff), [lineDiff]);
  const hasChanges = lineDiff.some((d) => d.type !== 'unchanged');

  // Line-level display items
  const diff = granularity === 'word' ? wordDiff : lineDiff;
  const processedLines = useMemo(() => processDiffToLines(diff), [diff]);
  const lineItems = useMemo(
    () =>
      collapsible
        ? collapseLines(processedLines, contextLines, expandedBlocks)
        : (processedLines as DisplayItem[]),
    [processedLines, collapsible, contextLines, expandedBlocks]
  );

  // Word-level display items
  const wordLines = useMemo(() => processWordDiffLines(wordDiff), [wordDiff]);
  const wordItems = useMemo(
    () =>
      collapsible
        ? collapseWordLines(wordLines, contextLines, expandedBlocks)
        : wordLines.map(
            (line) => ({ type: 'line' as const, line }) as WordDisplayItem
          ),
    [wordLines, collapsible, contextLines, expandedBlocks]
  );

  if (!hasChanges) {
    return (
      <div
        className={cn(
          'rounded-lg border bg-muted/30 p-6 text-center',
          className
        )}
      >
        <p className="text-muted-foreground text-sm">No changes detected</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1 border-dynamic-green/30 bg-dynamic-green/10 px-1.5 py-0.5 text-dynamic-green text-xs"
          >
            <Plus className="h-3 w-3" />
            {stats.added}
          </Badge>
          <Badge
            variant="outline"
            className="gap-1 border-dynamic-red/30 bg-dynamic-red/10 px-1.5 py-0.5 text-dynamic-red text-xs"
          >
            <Minus className="h-3 w-3" />
            {stats.removed}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <ToggleGroup
            type="single"
            value={granularity}
            onValueChange={(v) => v && setGranularity(v as 'word' | 'line')}
            className="h-7"
          >
            <ToggleGroupItem
              value="word"
              aria-label="Word diff"
              className="h-6 gap-1 px-1.5 text-xs"
            >
              <Type className="h-3 w-3" />
              Word
            </ToggleGroupItem>
            <ToggleGroupItem
              value="line"
              aria-label="Line diff"
              className="h-6 gap-1 px-1.5 text-xs"
            >
              <WrapText className="h-3 w-3" />
              Line
            </ToggleGroupItem>
          </ToggleGroup>

          <Separator
            orientation="vertical"
            className="mx-0.5 hidden h-4 sm:block"
          />

          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) =>
              v && setViewMode(v as 'unified' | 'split' | 'inline')
            }
            className="hidden h-7 sm:flex"
          >
            <ToggleGroupItem
              value="unified"
              aria-label="Unified view"
              className="h-6 gap-1 px-1.5 text-xs"
            >
              <Rows2 className="h-3 w-3" />
              Unified
            </ToggleGroupItem>
            <ToggleGroupItem
              value="split"
              aria-label="Split view"
              className="h-6 gap-1 px-1.5 text-xs"
            >
              <Columns2 className="h-3 w-3" />
              Split
            </ToggleGroupItem>
          </ToggleGroup>

          {expandedBlocks.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-muted-foreground text-xs"
              onClick={() => setExpandedBlocks(new Set())}
            >
              <FoldVertical className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Diff output */}
      {granularity === 'word' && viewMode !== 'split' ? (
        <InlineWordView
          items={wordItems}
          showLineNumbers={showLineNumbers}
          onToggle={toggleBlock}
        />
      ) : viewMode === 'split' ? (
        <SplitView
          items={lineItems}
          showLineNumbers={showLineNumbers}
          onToggle={toggleBlock}
          oldLabel={oldLabel}
          newLabel={newLabel}
        />
      ) : (
        <UnifiedView
          items={lineItems}
          showLineNumbers={showLineNumbers}
          onToggle={toggleBlock}
        />
      )}
    </div>
  );
}

/**
 * Centralized diff viewer for plain-text comparison.
 *
 * Supports three wrappers:
 * - `'none'` (default): renders the diff content directly
 * - `'inline'`: same as none but semantically indicates inline embedding
 * - `'dialog'`: wraps in a Dialog with a trigger button
 */
export function DiffViewer({
  wrapper = 'none',
  dialogTitle = 'Changes',
  trigger,
  ...props
}: DiffViewerProps) {
  const oldText = props.oldValue ?? '';
  const newText = props.newValue ?? '';
  const hasChanges = oldText !== newText;

  if (!hasChanges) return null;

  if (wrapper === 'dialog') {
    const defaultTrigger = (
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 px-2.5 text-xs"
      >
        View changes
      </Button>
    );

    return (
      <Dialog>
        <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
        <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-sm sm:text-base">
              {dialogTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <DiffViewerContent {...props} />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return <DiffViewerContent {...props} />;
}

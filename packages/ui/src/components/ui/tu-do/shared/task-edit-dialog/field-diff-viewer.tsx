'use client';

import type { JSONContent } from '@tiptap/react';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Columns2,
  Eye,
  FileText,
  Flag,
  FolderKanban,
  Layers,
  Minus,
  Plus,
  Rows2,
  Tag,
  Target,
  Users,
  XCircle,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
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
  type ComparableField,
  formatDateForDisplay,
  getFieldDisplayInfo,
  getPriorityLabel,
  getRelationshipDiff,
  type SnapshotAssignee,
  type SnapshotLabel,
  type SnapshotProject,
  type TaskPriorityType,
} from '@tuturuuu/utils/task-snapshot';
import {
  computeLineDiff,
  type DiffChange,
  getDiffStats,
} from '@tuturuuu/utils/text-diff';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import { useMemo, useState } from 'react';
import type { EstimationType } from '../estimation-mapping';
import { mapEstimationPoints } from '../estimation-mapping';

interface FieldDiffViewerProps {
  fieldName: ComparableField;
  snapshotValue: unknown;
  currentValue: unknown;
  selected: boolean;
  onSelectionChange: (selected: boolean) => void;
  hasChanged: boolean;
  locale?: string;
  t?: (key: string, options?: { defaultValue?: string }) => string;
  /** List names for displaying list changes (instead of IDs) */
  snapshotListName?: string | null;
  currentListName?: string | null;
  /** Estimation type for displaying points (t-shirt, fibonacci, etc.) */
  estimationType?: EstimationType;
}

const defaultT = (key: string, opts?: { defaultValue?: string }) =>
  opts?.defaultValue || key;

const icons = {
  FileText,
  Flag,
  Clock,
  Calendar,
  Target,
  Layers,
  CheckCircle2,
  Users,
  Tag,
  FolderKanban,
};

export function FieldDiffViewer({
  fieldName,
  snapshotValue,
  currentValue,
  selected,
  onSelectionChange,
  hasChanged,
  locale = 'en',
  t = defaultT,
  snapshotListName,
  currentListName,
  estimationType,
}: FieldDiffViewerProps) {
  const fieldInfo = getFieldDisplayInfo(fieldName, t, icons);
  const Icon = fieldInfo.icon;

  return (
    <div
      className={cn(
        'group rounded-lg border p-3 transition-colors',
        hasChanged
          ? 'border-dynamic-orange/30 bg-dynamic-orange/5'
          : 'border-border bg-muted/20',
        selected && hasChanged && 'border-dynamic-blue/50 bg-dynamic-blue/10'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox for selection */}
        <Checkbox
          checked={selected}
          onCheckedChange={onSelectionChange}
          disabled={!hasChanged}
          className="mt-0.5"
        />

        {/* Field icon */}
        <div
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            hasChanged ? 'bg-dynamic-orange/10' : 'bg-muted'
          )}
        >
          <Icon
            className={cn(
              'h-3.5 w-3.5',
              hasChanged ? 'text-dynamic-orange' : 'text-muted-foreground'
            )}
          />
        </div>

        {/* Field content */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="font-medium text-sm">{fieldInfo.label}</span>
            {hasChanged && (
              <Badge variant="secondary" className="text-xs">
                {t('changed', { defaultValue: 'Changed' })}
              </Badge>
            )}
          </div>

          {/* Render appropriate diff based on field type */}
          {hasChanged ? (
            <DiffContent
              fieldName={fieldName}
              snapshotValue={snapshotValue}
              currentValue={currentValue}
              locale={locale}
              t={t}
              snapshotListName={snapshotListName}
              currentListName={currentListName}
              estimationType={estimationType}
            />
          ) : (
            <div className="text-muted-foreground text-sm">
              {t('no_change', { defaultValue: 'No change' })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface DiffContentProps {
  fieldName: ComparableField;
  snapshotValue: unknown;
  currentValue: unknown;
  locale: string;
  t: (key: string, options?: { defaultValue?: string }) => string;
  snapshotListName?: string | null;
  currentListName?: string | null;
  estimationType?: EstimationType;
}

function DiffContent({
  fieldName,
  snapshotValue,
  currentValue,
  locale,
  t,
  snapshotListName,
  currentListName,
  estimationType,
}: DiffContentProps) {
  switch (fieldName) {
    case 'name':
      return (
        <TextDiff
          snapshotValue={snapshotValue as string}
          currentValue={currentValue as string}
          t={t}
        />
      );

    case 'description':
      return (
        <DescriptionDiff
          snapshotValue={snapshotValue as string | JSONContent | null}
          currentValue={currentValue as string | JSONContent | null}
          t={t}
        />
      );

    case 'priority':
      return (
        <PriorityDiff
          snapshotValue={snapshotValue as TaskPriorityType | null}
          currentValue={currentValue as TaskPriorityType | null}
          t={t}
        />
      );

    case 'start_date':
    case 'end_date':
      return (
        <DateDiff
          snapshotValue={snapshotValue as string | null}
          currentValue={currentValue as string | null}
          locale={locale}
          t={t}
        />
      );

    case 'estimation_points':
      return (
        <EstimationDiff
          snapshotValue={snapshotValue as number | null}
          currentValue={currentValue as number | null}
          estimationType={estimationType}
          t={t}
        />
      );

    case 'list_id':
      return (
        <ListDiff
          snapshotName={
            snapshotListName || t('unknown_list', { defaultValue: 'Unknown' })
          }
          currentName={
            currentListName || t('unknown_list', { defaultValue: 'Unknown' })
          }
        />
      );

    case 'completed':
      return (
        <BooleanDiff
          snapshotValue={snapshotValue as boolean}
          currentValue={currentValue as boolean}
          t={t}
        />
      );

    case 'assignees':
      return (
        <AssigneesDiff
          snapshotValue={snapshotValue as SnapshotAssignee[]}
          currentValue={currentValue as SnapshotAssignee[]}
          t={t}
        />
      );

    case 'labels':
      return (
        <LabelsDiff
          snapshotValue={snapshotValue as SnapshotLabel[]}
          currentValue={currentValue as SnapshotLabel[]}
          t={t}
        />
      );

    case 'projects':
      return (
        <ProjectsDiff
          snapshotValue={snapshotValue as SnapshotProject[]}
          currentValue={currentValue as SnapshotProject[]}
          t={t}
        />
      );

    default:
      return (
        <TextDiff
          snapshotValue={String(snapshotValue || '')}
          currentValue={String(currentValue || '')}
          t={t}
        />
      );
  }
}

// Sub-components for different field types

function TextDiff({
  snapshotValue,
  currentValue,
  t,
}: {
  snapshotValue: string;
  currentValue: string;
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">
          {t('snapshot', { defaultValue: 'Snapshot:' })}
        </span>
        <span className="rounded bg-dynamic-green/10 px-1.5 py-0.5 text-dynamic-green">
          {snapshotValue || '-'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">
          {t('current', { defaultValue: 'Current:' })}
        </span>
        <span className="rounded bg-dynamic-red/10 px-1.5 py-0.5 text-dynamic-red line-through">
          {currentValue || '-'}
        </span>
      </div>
    </div>
  );
}

type DiffViewMode = 'unified' | 'split';

function DescriptionDiff({
  snapshotValue,
  currentValue,
  t,
}: {
  snapshotValue: string | JSONContent | null;
  currentValue: string | JSONContent | null;
  t: (
    key: string,
    options?: { defaultValue?: string; count?: number }
  ) => string;
}) {
  const [viewMode, setViewMode] = useState<DiffViewMode>('unified');

  const hasSnapshot = !!snapshotValue;
  const hasCurrent = !!currentValue;

  // Extract text from descriptions
  const snapshotText = useMemo(
    () => getDescriptionText(snapshotValue as string),
    [snapshotValue]
  );
  const currentText = useMemo(
    () => getDescriptionText(currentValue as string),
    [currentValue]
  );

  // Compute diff
  const diff = useMemo(
    () => computeLineDiff(currentText, snapshotText),
    [currentText, snapshotText]
  );
  const stats = useMemo(() => getDiffStats(diff), [diff]);
  const hasTextChanges = diff.some((d) => d.type !== 'unchanged');

  // Badge to show the type of change
  const changeBadge = (
    <>
      {hasSnapshot && !hasCurrent && (
        <Badge variant="outline" className="text-dynamic-green text-xs">
          <Plus className="mr-1 h-3 w-3" />
          {t('had_content', { defaultValue: 'Had content' })}
        </Badge>
      )}
      {!hasSnapshot && hasCurrent && (
        <Badge variant="outline" className="text-dynamic-red text-xs">
          <Minus className="mr-1 h-3 w-3" />
          {t('was_empty', { defaultValue: 'Was empty' })}
        </Badge>
      )}
      {hasSnapshot && hasCurrent && (
        <Badge variant="outline" className="text-dynamic-orange text-xs">
          <ArrowRight className="mr-1 h-3 w-3" />
          {t('content_changed', { defaultValue: 'Content changed' })}
        </Badge>
      )}
    </>
  );

  // If both exist and there are text changes, show a view changes button
  if (hasSnapshot && hasCurrent && hasTextChanges) {
    return (
      <div className="text-sm">
        <div className="flex items-center gap-2">
          {changeBadge}
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
              >
                <Eye className="h-3 w-3" />
                {t('view_changes', { defaultValue: 'View changes' })}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] w-[95vw] max-w-3xl md:max-w-4xl lg:max-w-5xl">
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
              </DialogHeader>

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
              <ScrollArea className="h-[50vh] md:h-[60vh]">
                {viewMode === 'unified' ? (
                  <UnifiedDiffView diff={diff} />
                ) : (
                  <SplitDiffView diff={diff} t={t} />
                )}
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm">
      <div className="flex items-center gap-2">{changeBadge}</div>
    </div>
  );
}

function UnifiedDiffView({ diff }: { diff: DiffChange[] }) {
  return (
    <div className="space-y-0.5 font-mono text-sm">
      {diff.map((change, index) => {
        const lines = change.value.split('\n').filter(Boolean);
        return lines.map((line, lineIndex) => (
          <div
            key={`${index}-${lineIndex}`}
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
            {line || ' '}
          </div>
        ));
      })}
    </div>
  );
}

function SplitDiffView({
  diff,
  t,
}: {
  diff: DiffChange[];
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  // Separate old and new lines
  const { oldLines, newLines } = useMemo(() => {
    const old: string[] = [];
    const newL: string[] = [];

    for (const change of diff) {
      const lines = change.value.split('\n').filter(Boolean);
      if (change.type === 'unchanged') {
        old.push(...lines);
        newL.push(...lines);
      } else if (change.type === 'removed') {
        old.push(...lines);
      } else if (change.type === 'added') {
        newL.push(...lines);
      }
    }

    return { oldLines: old, newLines: newL };
  }, [diff]);

  const maxLines = Math.max(oldLines.length, newLines.length);

  return (
    <div className="grid grid-cols-2 gap-0.5">
      {/* Headers */}
      <div className="sticky top-0 z-10 border-b bg-muted/80 px-3 py-1.5 font-medium text-muted-foreground text-xs backdrop-blur">
        {t('current_version', { defaultValue: 'Current' })}
      </div>
      <div className="sticky top-0 z-10 border-b bg-muted/80 px-3 py-1.5 font-medium text-muted-foreground text-xs backdrop-blur">
        {t('snapshot_version', { defaultValue: 'Snapshot' })}
      </div>

      {/* Diff rows */}
      {Array.from({ length: maxLines }).map((_, i) => {
        const oldLine = oldLines[i];
        const newLine = newLines[i];
        const isOldRemoved = Boolean(oldLine && !newLines.includes(oldLine));
        const isNewAdded = Boolean(newLine && !oldLines.includes(newLine));

        return (
          <SplitDiffRow
            key={i}
            oldLine={oldLine}
            newLine={newLine}
            isOldRemoved={isOldRemoved}
            isNewAdded={isNewAdded}
          />
        );
      })}
    </div>
  );
}

function SplitDiffRow({
  oldLine,
  newLine,
  isOldRemoved,
  isNewAdded,
}: {
  oldLine?: string;
  newLine?: string;
  isOldRemoved: boolean;
  isNewAdded: boolean;
}) {
  return (
    <>
      {/* Left side (current) */}
      <div
        className={cn(
          'min-h-6 whitespace-pre-wrap border-r px-3 py-0.5 font-mono text-sm',
          isOldRemoved && 'bg-dynamic-red/10 text-dynamic-red line-through',
          !isOldRemoved && oldLine && 'text-muted-foreground',
          !oldLine && 'bg-muted/30'
        )}
      >
        {oldLine && (
          <div>
            {isOldRemoved && (
              <span className="mr-2 inline-block w-3 text-right opacity-50">
                -
              </span>
            )}
            {oldLine || ' '}
          </div>
        )}
      </div>

      {/* Right side (snapshot) */}
      <div
        className={cn(
          'min-h-6 whitespace-pre-wrap px-3 py-0.5 font-mono text-sm',
          isNewAdded && 'bg-dynamic-green/10 text-dynamic-green',
          !isNewAdded && newLine && 'text-muted-foreground',
          !newLine && 'bg-muted/30'
        )}
      >
        {newLine && (
          <div>
            {isNewAdded && (
              <span className="mr-2 inline-block w-3 text-right opacity-50">
                +
              </span>
            )}
            {newLine || ' '}
          </div>
        )}
      </div>
    </>
  );
}

function PriorityDiff({
  snapshotValue,
  currentValue,
  t,
}: {
  snapshotValue: TaskPriorityType | null;
  currentValue: TaskPriorityType | null;
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  const snapshotLabel = getPriorityLabel(snapshotValue, t);
  const currentLabel = getPriorityLabel(currentValue, t);

  return (
    <div className="flex items-center gap-2 text-sm">
      <Badge
        variant="outline"
        className="bg-dynamic-green/10 text-dynamic-green"
      >
        {snapshotLabel}
      </Badge>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <Badge
        variant="outline"
        className="bg-dynamic-red/10 text-dynamic-red line-through"
      >
        {currentLabel}
      </Badge>
    </div>
  );
}

function DateDiff({
  snapshotValue,
  currentValue,
  locale,
}: {
  snapshotValue: string | null;
  currentValue: string | null;
  locale: string;
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  const snapshotFormatted = formatDateForDisplay(snapshotValue, locale);
  const currentFormatted = formatDateForDisplay(currentValue, locale);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="rounded bg-dynamic-green/10 px-1.5 py-0.5 text-dynamic-green text-xs">
        {snapshotFormatted}
      </span>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <span className="rounded bg-dynamic-red/10 px-1.5 py-0.5 text-dynamic-red text-xs line-through">
        {currentFormatted}
      </span>
    </div>
  );
}

function EstimationDiff({
  snapshotValue,
  currentValue,
  estimationType,
  t,
}: {
  snapshotValue: number | null;
  currentValue: number | null;
  estimationType?: EstimationType;
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  const format = (val: number | null) => {
    if (val === null) return '-';
    if (estimationType) {
      return mapEstimationPoints(val, estimationType);
    }
    return `${val} ${t('points', { defaultValue: 'pts' })}`;
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <Badge
        variant="outline"
        className="bg-dynamic-green/10 text-dynamic-green"
      >
        {format(snapshotValue)}
      </Badge>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <Badge
        variant="outline"
        className="bg-dynamic-red/10 text-dynamic-red line-through"
      >
        {format(currentValue)}
      </Badge>
    </div>
  );
}

function ListDiff({
  snapshotName,
  currentName,
}: {
  snapshotName: string;
  currentName: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Badge
        variant="outline"
        className="bg-dynamic-green/10 text-dynamic-green"
      >
        {snapshotName}
      </Badge>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <Badge
        variant="outline"
        className="bg-dynamic-red/10 text-dynamic-red line-through"
      >
        {currentName}
      </Badge>
    </div>
  );
}

function BooleanDiff({
  snapshotValue,
  currentValue,
  t,
}: {
  snapshotValue: boolean;
  currentValue: boolean;
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Badge
        variant="outline"
        className={cn(
          snapshotValue
            ? 'bg-dynamic-green/10 text-dynamic-green'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {snapshotValue ? (
          <CheckCircle2 className="mr-1 h-3 w-3" />
        ) : (
          <XCircle className="mr-1 h-3 w-3" />
        )}
        {snapshotValue
          ? t('completed', { defaultValue: 'Completed' })
          : t('incomplete', { defaultValue: 'Incomplete' })}
      </Badge>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <Badge
        variant="outline"
        className={cn(
          'line-through',
          currentValue
            ? 'bg-dynamic-green/10 text-dynamic-green'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {currentValue
          ? t('completed', { defaultValue: 'Completed' })
          : t('incomplete', { defaultValue: 'Incomplete' })}
      </Badge>
    </div>
  );
}

function AssigneesDiff({
  snapshotValue,
  currentValue,
}: {
  snapshotValue: SnapshotAssignee[];
  currentValue: SnapshotAssignee[];
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  const { added, removed } = getRelationshipDiff(snapshotValue, currentValue);

  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {removed.map((assignee) => (
        <div
          key={assignee.id}
          className="flex items-center gap-1.5 rounded bg-dynamic-green/10 px-2 py-0.5"
        >
          <Plus className="h-3 w-3 text-dynamic-green" />
          <div className="flex items-center gap-1">
            <Avatar className="h-4 w-4">
              <AvatarImage src={assignee.avatar_url || undefined} />
              <AvatarFallback className="text-[8px]">
                {(assignee.display_name || '?')[0]}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs">
              {assignee.display_name || 'Unknown'}
            </span>
          </div>
        </div>
      ))}
      {added.map((assignee) => (
        <div
          key={assignee.id}
          className="flex items-center gap-1.5 rounded bg-dynamic-red/10 px-2 py-0.5"
        >
          <Minus className="h-3 w-3 text-dynamic-red" />
          <div className="flex items-center gap-1 line-through">
            <Avatar className="h-4 w-4">
              <AvatarImage src={assignee.avatar_url || undefined} />
              <AvatarFallback className="text-[8px]">
                {(assignee.display_name || '?')[0]}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs">
              {assignee.display_name || 'Unknown'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function LabelsDiff({
  snapshotValue,
  currentValue,
}: {
  snapshotValue: SnapshotLabel[];
  currentValue: SnapshotLabel[];
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  const { added, removed } = getRelationshipDiff(snapshotValue, currentValue);

  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {removed.map((label) => (
        <Badge
          key={label.id}
          variant="outline"
          className="gap-1 bg-dynamic-green/10"
          style={
            label.color
              ? { borderColor: `${label.color}40`, color: label.color }
              : undefined
          }
        >
          <Plus className="h-3 w-3" />
          {label.color && (
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: label.color }}
            />
          )}
          {label.name}
        </Badge>
      ))}
      {added.map((label) => (
        <Badge
          key={label.id}
          variant="outline"
          className="gap-1 bg-dynamic-red/10 line-through"
          style={
            label.color
              ? { borderColor: `${label.color}40`, color: label.color }
              : undefined
          }
        >
          <Minus className="h-3 w-3" />
          {label.color && (
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: label.color }}
            />
          )}
          {label.name}
        </Badge>
      ))}
    </div>
  );
}

function ProjectsDiff({
  snapshotValue,
  currentValue,
}: {
  snapshotValue: SnapshotProject[];
  currentValue: SnapshotProject[];
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  const { added, removed } = getRelationshipDiff(snapshotValue, currentValue);

  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {removed.map((project) => (
        <Badge
          key={project.id}
          variant="outline"
          className="gap-1 bg-dynamic-green/10 text-dynamic-green"
        >
          <Plus className="h-3 w-3" />
          <FolderKanban className="h-3 w-3" />
          {project.name}
        </Badge>
      ))}
      {added.map((project) => (
        <Badge
          key={project.id}
          variant="outline"
          className="gap-1 bg-dynamic-red/10 text-dynamic-red line-through"
        >
          <Minus className="h-3 w-3" />
          <FolderKanban className="h-3 w-3" />
          {project.name}
        </Badge>
      ))}
    </div>
  );
}

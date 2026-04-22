'use client';

import { Clock } from '@tuturuuu/icons';
import type { ExternalProjectEntry } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import type { WorkflowLane } from './cms-library-section-shared';
import type { CmsStrings } from './cms-strings';
import {
  formatDateLabel,
  formatStatus,
  statusTone,
  useInfiniteVisibleCount,
  type WorkflowFilter,
} from './cms-studio-utils';

function CmsWorkflowLane({
  entries,
  onOpenEntry,
  strings,
  title,
}: {
  entries: ExternalProjectEntry[];
  onOpenEntry: (entryId: string) => void;
  strings: CmsStrings;
  title: string;
}) {
  const { hasMore, sentinelRef, visibleCount } = useInfiniteVisibleCount({
    pageSize: 4,
    resetKey: title,
    totalCount: entries.length,
  });
  const visibleEntries = entries.slice(0, visibleCount);

  return (
    <Card className="border-border/70 bg-card/95 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">{title}</CardTitle>
          <Badge className={statusTone(entries[0]?.status ?? 'draft')}>
            {entries.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.length === 0 ? (
          <div className="rounded-[1rem] border border-border/70 border-dashed p-3 text-muted-foreground text-xs">
            {strings.emptyEntries}
          </div>
        ) : (
          <>
            {visibleEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="w-full rounded-[1rem] border border-border/70 bg-background/75 px-3 py-2 text-left transition-colors hover:bg-background"
                onClick={() => onOpenEntry(entry.id)}
              >
                <div className="truncate font-medium text-sm">
                  {entry.title}
                </div>
                <div className="mt-1 truncate text-muted-foreground text-xs">
                  {entry.slug}
                </div>
              </button>
            ))}
            {hasMore ? (
              <div
                ref={sentinelRef}
                aria-hidden="true"
                className="h-16 rounded-[1rem] border border-border/70 border-dashed bg-background/40"
              />
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function CmsWorkflowSection({
  onOpenEntry,
  onSelectBulkEntry,
  onSetWorkflowFilter,
  onSetWorkflowScheduleValue,
  onWorkflowAction,
  scheduleValue,
  selectedBulkIds,
  strings,
  workflowEntries,
  workflowFilter,
  workflowLanes,
}: {
  onOpenEntry: (entryId: string) => void;
  onSelectBulkEntry: (entryId: string, checked: boolean) => void;
  onSetWorkflowFilter: (filter: WorkflowFilter) => void;
  onSetWorkflowScheduleValue: (value: string) => void;
  onWorkflowAction: (payload: {
    action:
      | 'archive'
      | 'publish'
      | 'restore-draft'
      | 'schedule'
      | 'set-status'
      | 'unpublish';
    scheduledFor?: string | null;
    status?: ExternalProjectEntry['status'];
  }) => void;
  scheduleValue: string;
  selectedBulkIds: string[];
  strings: CmsStrings;
  workflowEntries: ExternalProjectEntry[];
  workflowFilter: WorkflowFilter;
  workflowLanes: WorkflowLane[];
}) {
  const { hasMore, sentinelRef, visibleCount } = useInfiniteVisibleCount({
    pageSize: 20,
    resetKey: workflowFilter,
    totalCount: workflowEntries.length,
  });
  const visibleWorkflowEntries = workflowEntries.slice(0, visibleCount);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {workflowLanes.map((lane) => (
          <CmsWorkflowLane
            key={lane.status}
            entries={lane.entries}
            onOpenEntry={onOpenEntry}
            strings={strings}
            title={lane.title}
          />
        ))}
      </div>

      <Card className="border-border/70 bg-card/95 shadow-none">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={workflowFilter}
              onValueChange={(value) =>
                onSetWorkflowFilter(value as WorkflowFilter)
              }
            >
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder={strings.filterAll} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{strings.filterAll}</SelectItem>
                <SelectItem value="draft">{strings.draftQueue}</SelectItem>
                <SelectItem value="scheduled">
                  {strings.scheduledQueue}
                </SelectItem>
                <SelectItem value="published">
                  {strings.publishedQueue}
                </SelectItem>
                <SelectItem value="archived">
                  {strings.archivedQueue}
                </SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="h-9 w-[220px]"
              type="datetime-local"
              value={scheduleValue}
              onChange={(event) =>
                onSetWorkflowScheduleValue(event.target.value)
              }
            />
            <Button
              size="sm"
              disabled={selectedBulkIds.length === 0}
              onClick={() =>
                onWorkflowAction({
                  action: 'schedule',
                  scheduledFor: scheduleValue
                    ? new Date(scheduleValue).toISOString()
                    : null,
                })
              }
            >
              <Clock className="mr-2 h-4 w-4" />
              {strings.scheduleAction}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selectedBulkIds.length === 0}
              onClick={() => onWorkflowAction({ action: 'publish' })}
            >
              {strings.publishAction}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selectedBulkIds.length === 0}
              onClick={() => onWorkflowAction({ action: 'archive' })}
            >
              {strings.archiveAction}
            </Button>
          </div>

          <div className="space-y-2">
            {visibleWorkflowEntries.map((entry) => (
              <label
                key={entry.id}
                className="flex items-center gap-3 rounded-[1rem] border border-border/70 bg-background/75 px-3 py-2"
              >
                <Checkbox
                  checked={selectedBulkIds.includes(entry.id)}
                  onCheckedChange={(checked) =>
                    onSelectBulkEntry(entry.id, Boolean(checked))
                  }
                />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onOpenEntry(entry.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate font-medium text-sm">
                      {entry.title}
                    </div>
                    <Badge className={statusTone(entry.status)}>
                      {formatStatus(entry.status, strings)}
                    </Badge>
                  </div>
                  <div className="mt-1 text-muted-foreground text-xs">
                    {entry.slug} ·{' '}
                    {formatDateLabel(
                      entry.scheduled_for,
                      strings.notScheduledLabel
                    )}
                  </div>
                </button>
              </label>
            ))}
            {hasMore ? (
              <div
                ref={sentinelRef}
                aria-hidden="true"
                className="h-16 rounded-[1rem] border border-border/70 border-dashed bg-background/40"
              />
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

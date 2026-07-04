'use client';

import {
  Flame,
  Plus,
  RefreshCw,
  Settings2,
  ShieldPlus,
  Snowflake,
  Trash2,
} from '@tuturuuu/icons';
import type {
  HabitTrackerDetailResponse,
  HabitTrackerEntryInput,
  HabitTrackerScope,
  HabitTrackerStreakActionInput,
} from '@tuturuuu/types/primitives/HabitTracker';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Progress } from '@tuturuuu/ui/progress';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@tuturuuu/ui/sheet';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  formatCompactNumber,
  formatFieldValue,
  getPrimaryField,
  getTrackerColorClasses,
  getTrackerSolidClass,
  TrackerIcon,
} from './tracker-shared';

function EntryDialog({
  detail,
  onOpenChange,
  onSubmit,
  open,
  submitting,
}: {
  detail: HabitTrackerDetailResponse;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: HabitTrackerEntryInput) => Promise<void> | void;
  open: boolean;
  submitting?: boolean;
}) {
  const t = useTranslations('habit-tracker.detail');
  const [entryDate, setEntryDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');
  const [values, setValues] = useState<Record<string, string | boolean>>({});

  useEffect(() => {
    if (!open) return;

    setEntryDate(new Date().toISOString().slice(0, 10));
    setNote('');
    setTags('');
    setValues(
      Object.fromEntries(
        detail.tracker.input_schema.map((field) => [
          field.key,
          field.type === 'boolean' ? false : '',
        ])
      )
    );
  }, [open, detail.tracker.input_schema]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('log_entry')}</DialogTitle>
          <DialogDescription>{t('log_entry_description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="entry-date">{t('entry_date')}</Label>
            <Input
              id="entry-date"
              onChange={(event) => setEntryDate(event.target.value)}
              type="date"
              value={entryDate}
            />
          </div>

          {detail.tracker.input_schema.map((field) => (
            <div className="space-y-2" key={field.key}>
              <Label>{field.label}</Label>
              {field.type === 'boolean' ? (
                <Button
                  onClick={() =>
                    setValues((current) => ({
                      ...current,
                      [field.key]: current[field.key] !== true,
                    }))
                  }
                  type="button"
                  variant={values[field.key] === true ? 'default' : 'outline'}
                >
                  {values[field.key] === true
                    ? t('marked_done')
                    : t('mark_done')}
                </Button>
              ) : field.type === 'select' ? (
                <Select
                  onValueChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      [field.key]: value,
                    }))
                  }
                  value={String(values[field.key] ?? '')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(field.options ?? []).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.type === 'text' ? (
                <Textarea
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  rows={3}
                  value={String(values[field.key] ?? '')}
                />
              ) : (
                <Input
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  type="number"
                  value={String(values[field.key] ?? '')}
                />
              )}
            </div>
          ))}

          <div className="space-y-2">
            <Label htmlFor="entry-note">{t('entry_note')}</Label>
            <Textarea
              id="entry-note"
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              value={note}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="entry-tags">{t('entry_tags')}</Label>
            <Input
              id="entry-tags"
              onChange={(event) => setTags(event.target.value)}
              value={tags}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t('close')}
          </Button>
          <Button
            disabled={submitting}
            onClick={async () => {
              await onSubmit({
                entry_date: entryDate,
                note: note || null,
                tags: tags
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
                values: Object.fromEntries(
                  detail.tracker.input_schema.map((field) => {
                    const raw = values[field.key];

                    if (field.type === 'boolean') {
                      return [field.key, raw === true];
                    }

                    if (field.type === 'number' || field.type === 'duration') {
                      return [field.key, Number(raw || 0)];
                    }

                    return [field.key, String(raw ?? '')];
                  })
                ),
              });
            }}
            type="button"
          >
            {t('save_entry')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailLoadingState() {
  return (
    <div className="space-y-4 p-5">
      <Skeleton className="h-9 w-44" />
      <Skeleton className="h-28 w-full rounded-[24px]" />
      <Skeleton className="h-64 w-full rounded-[24px]" />
      <Skeleton className="h-48 w-full rounded-[24px]" />
    </div>
  );
}

function DetailEmptyState() {
  const t = useTranslations('habit-tracker');

  return (
    <div className="flex h-full min-h-[560px] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="rounded-full border border-border/70 bg-muted/40 px-4 py-2 text-muted-foreground text-sm">
        {t('selected_tracker')}
      </div>
      <div className="space-y-2">
        <p className="font-semibold text-xl">{t('detail_placeholder_title')}</p>
        <p className="max-w-sm text-muted-foreground text-sm">
          {t('detail_placeholder_description')}
        </p>
      </div>
    </div>
  );
}

function TrackerDetailContent({
  archiving,
  currentUserId,
  detail,
  loading,
  onArchive,
  onCreateEntry,
  onDeleteEntry,
  onEdit,
  onRefresh,
  onStreakAction,
  refreshing,
  scope,
}: {
  archiving?: boolean;
  currentUserId: string;
  detail?: HabitTrackerDetailResponse;
  loading?: boolean;
  onArchive?: () => void;
  onCreateEntry: (input: HabitTrackerEntryInput) => Promise<void> | void;
  onDeleteEntry: (entryId: string) => Promise<void> | void;
  onEdit?: () => void;
  onRefresh?: () => void;
  onStreakAction: (
    input: HabitTrackerStreakActionInput
  ) => Promise<void> | void;
  refreshing?: boolean;
  scope: HabitTrackerScope;
}) {
  const t = useTranslations('habit-tracker.detail');
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);

  if (loading) {
    return <DetailLoadingState />;
  }

  if (!detail) {
    return <DetailEmptyState />;
  }

  const colorClasses = getTrackerColorClasses(detail.tracker.color);
  const solidColorClass = getTrackerSolidClass(detail.tracker.color);
  const currentPeriodTotal =
    scope === 'team'
      ? (detail.team?.total_value ?? 0)
      : (detail.current_member?.current_period_total ?? 0);
  const progress = Math.min(
    100,
    detail.tracker.target_value > 0
      ? (currentPeriodTotal / detail.tracker.target_value) * 100
      : 0
  );
  const chartMax = Math.max(
    1,
    ...detail.current_period_metrics.map((metric) => metric.total)
  );
  const primaryField = getPrimaryField(detail.tracker);

  return (
    <>
      <EntryDialog
        detail={detail}
        onOpenChange={setEntryDialogOpen}
        onSubmit={async (input) => {
          await onCreateEntry(input);
          setEntryDialogOpen(false);
        }}
        open={entryDialogOpen}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-border/70 border-b px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={cn(
                  'rounded-2xl border p-3',
                  colorClasses.badge,
                  colorClasses.border,
                  colorClasses.text
                )}
              >
                <TrackerIcon icon={detail.tracker.icon} />
              </div>

              <div className="min-w-0">
                <p className="font-semibold text-xl">{detail.tracker.name}</p>
                <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
                  {detail.tracker.description || t('no_description')}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {detail.tracker.target_value} /{' '}
                    {detail.tracker.target_period}
                  </Badge>
                  <Badge variant="secondary">
                    {scope === 'team' ? t('team_scope') : t('member_scope')}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {onRefresh ? (
                <Button
                  disabled={refreshing}
                  onClick={onRefresh}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              ) : null}
              {onEdit ? (
                <Button
                  onClick={onEdit}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              ) : null}
              {onArchive ? (
                <Button
                  disabled={archiving}
                  onClick={onArchive}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 p-5">
            <Tabs defaultValue="overview">
              <TabsList className="grid h-auto w-full grid-cols-3 rounded-2xl border border-border/70 bg-muted/40 p-1">
                <TabsTrigger className="rounded-xl px-4 py-2" value="overview">
                  {t('tabs.overview')}
                </TabsTrigger>
                <TabsTrigger className="rounded-xl px-4 py-2" value="entries">
                  {t('tabs.entries')}
                </TabsTrigger>
                <TabsTrigger
                  className="rounded-xl px-4 py-2"
                  value="leaderboard"
                >
                  {t('tabs.leaderboard')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <div className="space-y-5 pt-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-[24px] border border-border/70 bg-background/70 p-4">
                      <p className="text-muted-foreground text-xs">
                        {t('current_streak')}
                      </p>
                      <p className="mt-2 flex items-center gap-2 font-semibold text-2xl">
                        <Flame className="h-5 w-5 text-dynamic-orange" />
                        {formatCompactNumber(
                          detail.current_member?.streak.current_streak ?? 0
                        )}
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-border/70 bg-background/70 p-4">
                      <p className="text-muted-foreground text-xs">
                        {t('best_streak')}
                      </p>
                      <p className="mt-2 font-semibold text-2xl">
                        {formatCompactNumber(
                          detail.current_member?.streak.best_streak ?? 0
                        )}
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-border/70 bg-background/70 p-4">
                      <p className="text-muted-foreground text-xs">
                        {t('perfect_weeks')}
                      </p>
                      <p className="mt-2 font-semibold text-2xl">
                        {formatCompactNumber(
                          detail.current_member?.streak.perfect_week_count ?? 0
                        )}
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-border/70 bg-background/70 p-4">
                      <p className="text-muted-foreground text-xs">
                        {t('current_period')}
                      </p>
                      <p className="mt-2 font-semibold text-2xl">
                        {formatCompactNumber(currentPeriodTotal)}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[1.05fr,0.95fr]">
                    <div className="space-y-4 rounded-[24px] border border-border/70 bg-background/70 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-sm">
                            {t('goal_progress')}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {primaryField?.label ||
                              detail.tracker.primary_metric_key}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {detail.tracker.target_value}{' '}
                          {detail.tracker.target_period}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">
                            {formatCompactNumber(currentPeriodTotal)}
                          </span>
                          <span className="font-medium">
                            {formatCompactNumber(detail.tracker.target_value)}
                            {primaryField?.unit ? ` ${primaryField.unit}` : ''}
                          </span>
                        </div>
                        <Progress
                          className="h-3 bg-muted/60"
                          indicatorClassName={solidColorClass}
                          value={progress}
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => setEntryDialogOpen(true)}
                          type="button"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          {t('log_entry')}
                        </Button>

                        {detail.current_member?.streak.recovery_window
                          .eligible ? (
                          <>
                            <Button
                              onClick={() =>
                                onStreakAction({
                                  action_type: 'repair',
                                  period_start:
                                    detail.current_member?.streak
                                      .recovery_window.period_start ?? '',
                                })
                              }
                              type="button"
                              variant="outline"
                            >
                              <ShieldPlus className="mr-2 h-4 w-4" />
                              {t('repair_streak')}
                            </Button>
                            <Button
                              onClick={() =>
                                onStreakAction({
                                  action_type: 'freeze',
                                  period_start:
                                    detail.current_member?.streak
                                      .recovery_window.period_start ?? '',
                                })
                              }
                              type="button"
                              variant="outline"
                            >
                              <Snowflake className="mr-2 h-4 w-4" />
                              {t('use_freeze')}
                            </Button>
                          </>
                        ) : null}
                      </div>

                      <Badge className="w-fit" variant="outline">
                        {t('freezes_remaining', {
                          count: Math.max(
                            0,
                            (detail.current_member?.streak.freeze_count ?? 0) -
                              (detail.current_member?.streak.freezes_used ?? 0)
                          ),
                        })}
                      </Badge>
                    </div>

                    <div className="rounded-[24px] border border-border/70 bg-background/70 p-5">
                      <div className="mb-4 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm">
                            {t('trend_title')}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {t('period_count', {
                              count: detail.current_period_metrics.length,
                            })}
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {scope === 'team'
                            ? t('team_scope')
                            : t('member_scope')}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-12 gap-2">
                        {detail.current_period_metrics.map((metric) => (
                          <div className="space-y-2" key={metric.period_start}>
                            <div className="flex h-32 items-end">
                              <div
                                className={cn(
                                  'w-full rounded-t-md',
                                  colorClasses.badge,
                                  colorClasses.border
                                )}
                                style={{
                                  height: `${Math.max(8, (metric.total / chartMax) * 100)}%`,
                                }}
                              />
                            </div>
                            <p className="text-center text-[10px] text-muted-foreground">
                              {metric.period_start.slice(5)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="entries">
                <div className="space-y-4 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm">
                        {t('recent_entries')}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {t('entries_description')}
                      </p>
                    </div>
                    <Button
                      onClick={() => setEntryDialogOpen(true)}
                      type="button"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {t('log_entry')}
                    </Button>
                  </div>

                  {detail.entries.length === 0 ? (
                    <div className="rounded-[24px] border border-border/80 border-dashed bg-background/50 p-6 text-center text-muted-foreground text-sm">
                      {t('no_entries')}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {detail.entries.map((entry) => (
                        <div
                          className="rounded-[24px] border border-border/70 bg-background/70 p-4"
                          key={entry.id}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-3">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9">
                                  <AvatarImage
                                    src={entry.member?.avatar_url ?? ''}
                                  />
                                  <AvatarFallback>
                                    {(entry.member?.display_name ?? 'U').slice(
                                      0,
                                      1
                                    )}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-sm">
                                    {entry.member?.display_name ??
                                      t('unknown_member')}
                                  </p>
                                  <p className="text-muted-foreground text-xs">
                                    {entry.entry_date}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {Object.entries(entry.values).map(
                                  ([key, value]) => {
                                    const field =
                                      detail.tracker.input_schema.find(
                                        (item) => item.key === key
                                      );

                                    return (
                                      <Badge key={key} variant="secondary">
                                        {field?.label ?? key}:{' '}
                                        {formatFieldValue(field, value)}
                                      </Badge>
                                    );
                                  }
                                )}
                              </div>

                              {entry.note ? (
                                <p className="text-muted-foreground text-sm">
                                  {entry.note}
                                </p>
                              ) : null}
                            </div>

                            {entry.user_id === currentUserId ? (
                              <Button
                                onClick={() => onDeleteEntry(entry.id)}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="leaderboard">
                <div className="space-y-4 pt-4">
                  <div>
                    <p className="font-semibold text-sm">{t('leaderboard')}</p>
                    <p className="text-muted-foreground text-sm">
                      {t('leaderboard_description')}
                    </p>
                  </div>

                  {detail.leaderboard.length === 0 ? (
                    <div className="rounded-[24px] border border-border/80 border-dashed bg-background/50 p-6 text-center text-muted-foreground text-sm">
                      {t('no_leaderboard')}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {detail.leaderboard.map((row, index) => (
                        <div
                          className="flex items-center justify-between gap-3 rounded-[24px] border border-border/70 bg-background/70 p-4"
                          key={row.member.user_id}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <Badge variant="outline">#{index + 1}</Badge>
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={row.member.avatar_url ?? ''} />
                              <AvatarFallback>
                                {row.member.display_name.slice(0, 1)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-sm">
                                {row.member.display_name}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                {t('consistency_line', {
                                  rate: Math.round(row.consistency_rate),
                                })}
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className="font-semibold text-sm">
                              {row.current_streak} {t('streak_suffix')}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {t('best_line', { count: row.best_streak })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid gap-3 rounded-[24px] border border-border/70 bg-background/70 p-5 md:grid-cols-2">
                    <div>
                      <p className="text-muted-foreground text-xs">
                        {t('active_members')}
                      </p>
                      <p className="mt-2 font-semibold text-xl">
                        {formatCompactNumber(detail.team?.active_members ?? 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">
                        {t('top_streak')}
                      </p>
                      <p className="mt-2 font-semibold text-xl">
                        {formatCompactNumber(detail.team?.top_streak ?? 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">
                        {t('total_entries')}
                      </p>
                      <p className="mt-2 font-semibold text-xl">
                        {formatCompactNumber(detail.team?.total_entries ?? 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">
                        {t('average_consistency')}
                      </p>
                      <p className="mt-2 font-semibold text-xl">
                        {Math.round(detail.team?.average_consistency_rate ?? 0)}
                        %
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </div>
    </>
  );
}

export default function TrackerDetailSheet({
  archiving,
  currentUserId,
  detail,
  loading,
  onArchive,
  onCreateEntry,
  onDeleteEntry,
  onEdit,
  onOpenChange,
  onRefresh,
  onStreakAction,
  open,
  refreshing,
  scope,
  variant = 'sheet',
}: {
  archiving?: boolean;
  currentUserId: string;
  detail?: HabitTrackerDetailResponse;
  loading?: boolean;
  onArchive?: () => void;
  onCreateEntry: (input: HabitTrackerEntryInput) => Promise<void> | void;
  onDeleteEntry: (entryId: string) => Promise<void> | void;
  onEdit?: () => void;
  onOpenChange: (open: boolean) => void;
  onRefresh?: () => void;
  onStreakAction: (
    input: HabitTrackerStreakActionInput
  ) => Promise<void> | void;
  open: boolean;
  refreshing?: boolean;
  scope: HabitTrackerScope;
  variant?: 'panel' | 'sheet';
}) {
  if (variant === 'panel') {
    return (
      <div className="flex min-h-[680px] flex-col overflow-hidden rounded-[28px] border border-border/70 bg-card/90">
        <TrackerDetailContent
          archiving={archiving}
          currentUserId={currentUserId}
          detail={detail}
          loading={loading}
          onArchive={onArchive}
          onCreateEntry={onCreateEntry}
          onDeleteEntry={onDeleteEntry}
          onEdit={onEdit}
          onRefresh={onRefresh}
          onStreakAction={onStreakAction}
          refreshing={refreshing}
          scope={scope}
        />
      </div>
    );
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full p-0 sm:max-w-2xl xl:max-w-[52rem]">
        <SheetHeader className="sr-only">
          <SheetTitle>{detail?.tracker.name ?? ''}</SheetTitle>
          <SheetDescription>
            {detail?.tracker.description ?? ''}
          </SheetDescription>
        </SheetHeader>
        <TrackerDetailContent
          archiving={archiving}
          currentUserId={currentUserId}
          detail={detail}
          loading={loading}
          onArchive={onArchive}
          onCreateEntry={onCreateEntry}
          onDeleteEntry={onDeleteEntry}
          onEdit={onEdit}
          onRefresh={onRefresh}
          onStreakAction={onStreakAction}
          refreshing={refreshing}
          scope={scope}
        />
      </SheetContent>
    </Sheet>
  );
}

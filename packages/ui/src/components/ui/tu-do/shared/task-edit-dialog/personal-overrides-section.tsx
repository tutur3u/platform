'use client';

import {
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  Flag,
  Loader2,
  StickyNote,
  Timer,
  UserMinus,
  UserRoundCog,
} from '@tuturuuu/icons';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PRIORITY_BADGE_COLORS } from '../../utils/taskConstants';
import { getPriorityIcon } from '../../utils/taskPriorityUtils';
import {
  buildEstimationIndices,
  mapEstimationPoints,
} from '../estimation-mapping';
import { useTaskOverrides } from './hooks/use-task-overrides';

interface PersonalOverridesSectionProps {
  taskId: string | undefined;
  isCreateMode: boolean;
  boardConfig: any;
}

export function PersonalOverridesSection({
  taskId,
  isCreateMode,
  boardConfig,
}: PersonalOverridesSectionProps) {
  const t = useTranslations();
  const { weekStartsOn, timezone, timeFormat } = useCalendarPreferences();
  const { override, isLoading, upsert, isSaving } = useTaskOverrides(taskId);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);
  const [isEstimationOpen, setIsEstimationOpen] = useState(false);
  const [notes, setNotes] = useState('');

  // Don't render for new tasks
  if (isCreateMode || !taskId) return null;

  const selfManaged = override?.self_managed ?? false;
  const personallyCompleted = !!override?.completed_at;
  const personallyUnassigned = override?.personally_unassigned ?? false;

  const handleToggleSelfManaged = (checked: boolean) => {
    upsert({ self_managed: checked });
  };

  const handleToggleCompletion = (checked: boolean) => {
    upsert({
      completed_at: checked ? new Date().toISOString() : null,
    });
  };

  const handleToggleUnassigned = (checked: boolean) => {
    upsert({ personally_unassigned: checked });
  };

  const handlePriorityChange = (priority: TaskPriority | null) => {
    upsert({ priority_override: priority });
    setIsPriorityOpen(false);
  };

  const handleDueDateChange = (date: Date | undefined) => {
    upsert({
      due_date_override: date ? date.toISOString() : null,
    });
  };

  const handleEstimationChange = (points: number | null) => {
    upsert({ estimation_override: points });
    setIsEstimationOpen(false);
  };

  const handleNotesBlur = () => {
    if (notes !== (override?.notes ?? '')) {
      upsert({ notes: notes || null });
    }
  };

  // Sync notes from server when override changes
  const serverNotes = override?.notes ?? '';
  if (!isSaving && notes !== serverNotes && notes === '') {
    setNotes(serverNotes);
  }

  const estimationIndices = boardConfig?.estimation_type
    ? buildEstimationIndices({
        extended: boardConfig?.extended_estimation,
        allowZero: boardConfig?.allow_zero_estimates,
      })
    : [];

  return (
    <div className="border-t bg-muted/20">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-2 text-left transition-colors hover:bg-muted/40 md:px-8"
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              !isExpanded && '-rotate-90'
            )}
          />
          <UserRoundCog className="h-4 w-4 text-dynamic-purple" />
          <span className="font-semibold text-sm">
            {t('ws-tasks.personal_overrides')}
          </span>
          {selfManaged && (
            <Badge
              variant="secondary"
              className="h-5 gap-1 border-dynamic-purple/30 bg-dynamic-purple/15 px-2 text-[10px] text-dynamic-purple"
            >
              {t('ws-tasks.self_managed')}
            </Badge>
          )}
          {isLoading && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="space-y-3 border-t px-4 py-3 md:px-8">
          {/* Self-managed toggle */}
          <div className="flex items-center justify-between">
            <Label
              htmlFor="self-managed"
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <UserRoundCog className="h-4 w-4 text-dynamic-purple" />
              {t('ws-tasks.self_managed')}
            </Label>
            <Switch
              id="self-managed"
              checked={selfManaged}
              onCheckedChange={handleToggleSelfManaged}
              disabled={isSaving}
            />
          </div>

          {selfManaged && (
            <div className="space-y-3 rounded-lg border border-dynamic-purple/20 bg-dynamic-purple/5 p-3">
              {/* Personal completion */}
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="personal-complete"
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <CheckCircle className="h-4 w-4 text-dynamic-green" />
                  {t('ws-tasks.personal_completion')}
                </Label>
                <Switch
                  id="personal-complete"
                  checked={personallyCompleted}
                  onCheckedChange={handleToggleCompletion}
                  disabled={isSaving}
                />
              </div>

              {/* Personal priority */}
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm">
                  <Flag className="h-4 w-4 text-dynamic-orange" />
                  {t('ws-tasks.my_priority')}
                </Label>
                <Popover open={isPriorityOpen} onOpenChange={setIsPriorityOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-7 gap-1.5 text-xs',
                        override?.priority_override &&
                          PRIORITY_BADGE_COLORS[
                            override.priority_override as TaskPriority
                          ]
                      )}
                      disabled={isSaving}
                    >
                      {override?.priority_override
                        ? getPriorityIcon(
                            override.priority_override as TaskPriority,
                            'h-3 w-3'
                          )
                        : null}
                      {override?.priority_override
                        ? t(
                            `tasks.priority_${override.priority_override}` as any
                          )
                        : t('ws-tasks.use_team_value')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-48 p-1">
                    {(
                      ['critical', 'high', 'normal', 'low'] as TaskPriority[]
                    ).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handlePriorityChange(p)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                          override?.priority_override === p && 'bg-muted'
                        )}
                      >
                        {getPriorityIcon(p, 'h-3.5 w-3.5')}
                        {t(`tasks.priority_${p}` as any)}
                        {override?.priority_override === p && (
                          <Check className="ml-auto h-3.5 w-3.5" />
                        )}
                      </button>
                    ))}
                    {override?.priority_override && (
                      <button
                        type="button"
                        onClick={() => handlePriorityChange(null)}
                        className="flex w-full items-center gap-2 rounded-md border-t px-2 py-1.5 text-left text-muted-foreground text-sm hover:bg-muted"
                      >
                        {t('ws-tasks.use_team_value')}
                      </button>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Personal due date */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-dynamic-blue" />
                  {t('ws-tasks.my_due_date')}
                </Label>
                <DateTimePicker
                  date={
                    override?.due_date_override
                      ? new Date(override.due_date_override)
                      : undefined
                  }
                  setDate={handleDueDateChange}
                  showTimeSelect
                  allowClear
                  showFooterControls
                  preferences={{ weekStartsOn, timezone, timeFormat }}
                />
              </div>

              {/* Personal estimation */}
              {boardConfig?.estimation_type && (
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-sm">
                    <Timer className="h-4 w-4 text-dynamic-teal" />
                    {t('ws-tasks.my_estimate')}
                  </Label>
                  <Popover
                    open={isEstimationOpen}
                    onOpenChange={setIsEstimationOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={isSaving}
                      >
                        {override?.estimation_override != null
                          ? mapEstimationPoints(
                              override.estimation_override,
                              boardConfig.estimation_type
                            )
                          : t('ws-tasks.use_team_value')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-48 p-1">
                      {estimationIndices.map((idx: number) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleEstimationChange(idx)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                            override?.estimation_override === idx && 'bg-muted'
                          )}
                        >
                          {mapEstimationPoints(
                            idx,
                            boardConfig.estimation_type
                          )}
                          {override?.estimation_override === idx && (
                            <Check className="ml-auto h-3.5 w-3.5" />
                          )}
                        </button>
                      ))}
                      {override?.estimation_override != null && (
                        <button
                          type="button"
                          onClick={() => handleEstimationChange(null)}
                          className="flex w-full items-center gap-2 rounded-md border-t px-2 py-1.5 text-left text-muted-foreground text-sm hover:bg-muted"
                        >
                          {t('ws-tasks.use_team_value')}
                        </button>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Personally unassigned */}
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="personally-unassigned"
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <UserMinus className="h-4 w-4 text-dynamic-red" />
                  {t('ws-tasks.done_with_my_part')}
                </Label>
                <Switch
                  id="personally-unassigned"
                  checked={personallyUnassigned}
                  onCheckedChange={handleToggleUnassigned}
                  disabled={isSaving}
                />
              </div>

              {/* Personal notes */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2 text-sm">
                  <StickyNote className="h-4 w-4 text-muted-foreground" />
                  {t('ws-tasks.personal_notes')}
                </Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={handleNotesBlur}
                  placeholder={t('ws-tasks.personal_notes_placeholder')}
                  className="min-h-15 resize-none text-sm"
                  disabled={isSaving}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

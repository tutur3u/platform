'use client';

import {
  CalendarClock,
  CalendarPlus,
  RefreshCw,
  Repeat,
} from '@tuturuuu/icons';
import type { WorkspaceUserGroupScheduleGroup } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { FrequencyUpdateFields } from './frequency-update-fields';
import type {
  FrequencySeriesOption,
  FrequencyUpdateDraft,
} from './frequency-update-utils';
import { QuickWeeklyScheduleFields } from './quick-weekly-schedule-fields';
import type { QuickWeeklyScheduleDraft } from './quick-weekly-schedule-utils';

export type ScheduleSetupMode = 'create' | 'update';

interface ScheduleSetupEditorProps {
  canChooseGroup: boolean;
  createDraft: QuickWeeklyScheduleDraft;
  groupId: string;
  groups: WorkspaceUserGroupScheduleGroup[];
  isError: boolean;
  isLoading: boolean;
  mode: ScheduleSetupMode;
  onCreateDraftChange: (
    updater: (current: QuickWeeklyScheduleDraft) => QuickWeeklyScheduleDraft
  ) => void;
  onGroupChange: (groupId: string) => void;
  onModeChange: (mode: ScheduleSetupMode) => void;
  onRetry: () => void;
  onSeriesChange: (seriesId: string) => void;
  onUpdateDraftChange: (draft: FrequencyUpdateDraft) => void;
  selectedSeriesId: string;
  seriesOptions: FrequencySeriesOption[];
  updateDraft: FrequencyUpdateDraft | null;
}

export function ScheduleSetupEditor({
  canChooseGroup,
  createDraft,
  groupId,
  groups,
  isError,
  isLoading,
  mode,
  onCreateDraftChange,
  onGroupChange,
  onModeChange,
  onRetry,
  onSeriesChange,
  onUpdateDraftChange,
  selectedSeriesId,
  seriesOptions,
  updateDraft,
}: ScheduleSetupEditorProps) {
  const t = useTranslations('ws-user-group-schedule');
  const hasRecurringSchedule = seriesOptions.length > 0;

  return (
    <div className="space-y-5">
      {canChooseGroup && (
        <div className="space-y-2">
          <Label>{t('group')}</Label>
          <Select value={groupId} onValueChange={onGroupChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('group')} />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
          <div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
          <p className="text-muted-foreground text-sm">
            {t('schedule_setup_loading')}
          </p>
        </div>
      ) : isError ? (
        <div className="flex flex-col gap-3 rounded-xl border border-dynamic-red/30 bg-dynamic-red/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">{t('schedule_setup_load_failed')}</p>
          <Button
            className="w-full sm:w-auto"
            variant="outline"
            onClick={onRetry}
          >
            <RefreshCw className="h-4 w-4" />
            {t('schedule_setup_retry')}
          </Button>
        </div>
      ) : (
        <>
          <section
            className="space-y-2"
            aria-label={t('schedule_setup_choose_action')}
          >
            <div>
              <h3 className="font-medium text-sm">
                {t('schedule_setup_choose_action')}
              </h3>
              <p className="text-muted-foreground text-xs">
                {hasRecurringSchedule
                  ? t('schedule_setup_existing_count', {
                      count: seriesOptions.length,
                    })
                  : t('schedule_setup_no_series')}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                aria-pressed={mode === 'update'}
                className={cn(
                  'flex min-h-24 items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  mode === 'update'
                    ? 'border-dynamic-blue/60 bg-dynamic-blue/10'
                    : 'bg-background hover:bg-muted/40',
                  !hasRecurringSchedule && 'cursor-not-allowed opacity-55'
                )}
                disabled={!hasRecurringSchedule}
                type="button"
                onClick={() => onModeChange('update')}
              >
                <span className="rounded-lg bg-dynamic-blue/10 p-2 text-dynamic-blue">
                  <Repeat className="h-4 w-4" />
                </span>
                <span>
                  <span className="block font-medium text-sm">
                    {t('schedule_setup_update_title')}
                  </span>
                  <span className="mt-1 block text-muted-foreground text-xs leading-relaxed">
                    {t('schedule_setup_update_description')}
                  </span>
                </span>
              </button>
              <button
                aria-pressed={mode === 'create'}
                className={cn(
                  'flex min-h-24 items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  mode === 'create'
                    ? 'border-dynamic-green/60 bg-dynamic-green/10'
                    : 'bg-background hover:bg-muted/40'
                )}
                type="button"
                onClick={() => onModeChange('create')}
              >
                <span className="rounded-lg bg-dynamic-green/10 p-2 text-dynamic-green">
                  <CalendarPlus className="h-4 w-4" />
                </span>
                <span>
                  <span className="block font-medium text-sm">
                    {t('schedule_setup_create_title')}
                  </span>
                  <span className="mt-1 block text-muted-foreground text-xs leading-relaxed">
                    {t('schedule_setup_create_description')}
                  </span>
                </span>
              </button>
            </div>
          </section>

          <div className="rounded-2xl border bg-foreground/[0.015] p-3 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium text-sm">
                {mode === 'update'
                  ? t('schedule_setup_update_title')
                  : t('schedule_setup_create_title')}
              </h3>
            </div>
            {mode === 'update' ? (
              <FrequencyUpdateFields
                canChooseGroup={false}
                draft={updateDraft}
                groupId={groupId}
                groups={groups}
                onDraftChange={onUpdateDraftChange}
                onGroupChange={onGroupChange}
                onSeriesChange={onSeriesChange}
                selectedSeriesId={selectedSeriesId}
                seriesOptions={seriesOptions}
              />
            ) : (
              <QuickWeeklyScheduleFields
                canChooseGroup={false}
                draft={createDraft}
                groupId={groupId}
                groups={groups}
                setDraft={onCreateDraftChange}
                setGroupId={onGroupChange}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

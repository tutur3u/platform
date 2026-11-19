'use client';

import {
  AlertTriangle,
  Calendar,
  CalendarCheck,
  Flag,
  Settings,
  Timer,
} from '@tuturuuu/icons';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import dayjs from 'dayjs';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { priorityLabelKey } from '../../../../utils/task-priority-label-key';
import {
  buildEstimationIndices,
  type EstimationType,
  mapEstimationPoints,
} from '../../../estimation-mapping';
import type { WorkspaceTaskLabel } from '../../types';
import { QuickCreateChip } from './quick-create-chip';
import { QuickCreateCollectionChips } from './quick-create-collection-chips';
import { QuickCreateDatePicker } from './quick-create-date-picker';
import { QuickCreateListChip } from './quick-create-list-chip';
import { QuickCreateOptionPicker } from './quick-create-option-picker';
import {
  getPriorityOptions,
  type QuickCreateAssignee,
  type QuickCreateProject,
} from './quick-create-property-options';
import {
  formatQuickCreateDate,
  normalizeQuickCreateDueDate,
  type QuickCreateChipId,
} from './quick-create-values';

export interface QuickCreatePropertyChipsProps {
  wsId: string;
  boardId: string;
  locale: string;
  priority: TaskPriority | null;
  startDate: Date | undefined;
  endDate: Date | undefined;
  estimationPoints: number | null | undefined;
  selectedLabels: WorkspaceTaskLabel[];
  selectedProjects: QuickCreateProject[];
  selectedListId: string;
  selectedAssignees: QuickCreateAssignee[];
  isPersonalWorkspace: boolean;
  canUseBoardAssignees?: boolean;
  availableLists: TaskList[];
  availableLabels: WorkspaceTaskLabel[];
  taskProjects: QuickCreateProject[];
  workspaceMembers: QuickCreateAssignee[];
  boardConfig?: {
    estimation_type?: string | null;
    extended_estimation?: boolean | null;
    allow_zero_estimates?: boolean | null;
  } | null;
  disabled?: boolean;
  /** Drafts do not store projects, so the Project chip is hidden. */
  isDraftMode?: boolean;
  onPriorityChange: (priority: TaskPriority | null) => void;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
  onEstimationChange: (points: number | null) => void;
  onLabelToggle: (label: WorkspaceTaskLabel) => void;
  // Method syntax lets callers pass handlers typed for richer records.
  onProjectToggle(project: QuickCreateProject): void;
  onListChange: (listId: string) => void;
  onAssigneeToggle(assignee: QuickCreateAssignee): void;
  onQuickDueDate: (days: number | null) => void;
  onShowNewLabelDialog: () => void;
  onShowNewProjectDialog: () => void;
  onShowEstimationConfigDialog: () => void;
}

/** The labeled property chips of the quick-create dialog, in Tab order. */
export function QuickCreatePropertyChips(props: QuickCreatePropertyChipsProps) {
  const t = useTranslations();
  const tq = useTranslations('ws-task-boards.dialog.quick_create');
  const [openChip, setOpenChip] = useState<QuickCreateChipId | null>(null);
  const { startDate, endDate, estimationPoints, boardConfig, disabled } = props;
  const { timezone } = useCalendarPreferences();
  const timeZone = timezone && timezone !== 'auto' ? timezone : undefined;
  const formatDate = (date: Date) =>
    formatQuickCreateDate(date, props.locale, timeZone);
  const none = tq('none');
  const chipState = (id: QuickCreateChipId) => ({
    open: openChip === id,
    disabled,
    onOpenChange: (open: boolean) =>
      setOpenChip((current) => (open ? id : current === id ? null : current)),
  });
  const close = () => setOpenChip(null);
  const fillStartWhenUndated = () => {
    if (!startDate && !endDate) {
      props.onStartDateChange(dayjs().startOf('day').toDate());
    }
  };
  const estimationType = (boardConfig?.estimation_type ??
    null) as EstimationType | null;
  const estimationOptions = estimationType
    ? buildEstimationIndices({
        extended: boardConfig?.extended_estimation,
        allowZero: boardConfig?.allow_zero_estimates,
      }).map((points) => ({
        id: String(points),
        label: mapEstimationPoints(points, estimationType),
      }))
    : [];
  const search = tq('search');
  const noResults = tq('no_results');

  return (
    <div
      data-testid="quick-create-property-chips"
      className="flex w-full flex-wrap items-center gap-1.5 max-sm:grid max-sm:grid-cols-2 max-sm:gap-2"
    >
      <QuickCreateListChip
        wsId={props.wsId}
        boardId={props.boardId}
        selectedListId={props.selectedListId}
        availableLists={props.availableLists}
        onListChange={props.onListChange}
        {...chipState('list')}
      />
      <QuickCreateChip
        id="priority"
        icon={Flag}
        label={tq('priority')}
        value={props.priority ? t(priorityLabelKey(props.priority)) : null}
        emptyValue={none}
        {...chipState('priority')}
      >
        <QuickCreateOptionPicker
          options={getPriorityOptions((priority) =>
            t(priorityLabelKey(priority))
          )}
          selectedIds={props.priority ? [props.priority] : []}
          searchPlaceholder={search}
          emptyLabel={noResults}
          numericShortcuts="position"
          onDismiss={close}
          onSelect={(id) => {
            props.onPriorityChange(id as TaskPriority);
            close();
          }}
          clearLabel={t('ws-task-boards.dialog.clear_priority')}
          onClear={() => {
            props.onPriorityChange(null);
            close();
          }}
        />
      </QuickCreateChip>
      <QuickCreateChip
        id="start"
        icon={Calendar}
        label={tq('start')}
        value={startDate ? formatDate(startDate) : null}
        emptyValue={none}
        contentClassName="w-auto"
        {...chipState('start')}
      >
        <QuickCreateDatePicker
          date={startDate}
          maxDate={endDate}
          onChange={props.onStartDateChange}
        />
      </QuickCreateChip>
      <QuickCreateChip
        id="due"
        icon={CalendarCheck}
        label={tq('due')}
        value={endDate ? formatDate(endDate) : null}
        emptyValue={none}
        contentClassName="w-auto"
        {...chipState('due')}
      >
        <QuickCreateDatePicker
          date={endDate}
          minDate={startDate}
          onChange={(date) => {
            if (date) fillStartWhenUndated();
            props.onEndDateChange(
              date ? normalizeQuickCreateDueDate(date) : undefined
            );
          }}
          onQuickPick={(days) => {
            fillStartWhenUndated();
            props.onQuickDueDate(days);
            close();
          }}
        />
      </QuickCreateChip>
      <QuickCreateChip
        id="estimate"
        icon={Timer}
        label={tq('estimate')}
        value={
          estimationType && estimationPoints != null
            ? mapEstimationPoints(estimationPoints, estimationType)
            : null
        }
        emptyValue={none}
        {...chipState('estimate')}
      >
        <QuickCreateOptionPicker
          options={estimationOptions}
          selectedIds={
            estimationPoints != null ? [String(estimationPoints)] : []
          }
          searchPlaceholder={search}
          emptyLabel={
            estimationType
              ? noResults
              : t('ws-task-boards.dialog.no_estimation_configured')
          }
          numericShortcuts="label"
          onDismiss={close}
          onSelect={(id) => {
            props.onEstimationChange(Number(id));
            close();
          }}
          clearLabel={t('ws-task-boards.dialog.clear_estimate')}
          onClear={() => {
            props.onEstimationChange(null);
            close();
          }}
          action={
            estimationType
              ? undefined
              : {
                  label: t('common.configure'),
                  icon: Settings,
                  onSelect: () => {
                    close();
                    props.onShowEstimationConfigDialog();
                  },
                }
          }
        />
      </QuickCreateChip>
      <QuickCreateCollectionChips
        {...props}
        chipState={chipState}
        close={close}
        emptyValue={none}
        searchPlaceholder={search}
        noResults={noResults}
      />
      {startDate && endDate && startDate > endDate ? (
        <p
          role="alert"
          className="flex w-full items-center gap-1.5 text-dynamic-orange text-xs max-sm:col-span-2"
        >
          <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
          {t('ws-task-boards.dialog.start_date_after_due_date')}
        </p>
      ) : null}
    </div>
  );
}

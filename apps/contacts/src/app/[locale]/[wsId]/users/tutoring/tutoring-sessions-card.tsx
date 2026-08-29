'use client';

import { CalendarPlus, Download, GraduationCap } from '@tuturuuu/icons';
import type {
  TutoringAttendanceStatus,
  TutoringSessionRecord,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import type { ListTutoringSessionsParams } from '@tuturuuu/internal-api/tutoring';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { TutoringCreateCard } from './tutoring-create-card';
import {
  runTutoringExport,
  type TutoringExportFormat,
} from './tutoring-export';
import {
  isTutoringSessionFiltered,
  type TutoringSessionFilters,
} from './tutoring-filters';
import { TutoringParentMessageDialog } from './tutoring-parent-message-dialog';
import { buildTutoringSessionColumns } from './tutoring-session-columns';
import { TutoringSessionFiltersBar } from './tutoring-session-filters';
import type { TutoringFormValues } from './tutoring-types';

const EXPORT_FORMATS: TutoringExportFormat[] = [
  'detailed-csv',
  'detailed-xlsx',
  'payroll-csv',
  'payroll-xlsx',
];

interface TutoringSessionsCreateState {
  form: TutoringFormValues;
  isSubmitting: boolean;
  open: boolean;
}

interface TutoringSessionsPagination {
  count: number;
  page: number;
  pageSize: number;
}

interface TutoringSessionsActions {
  onCreate: () => void;
  onCreateDialogOpenChange: (open: boolean) => void;
  onCreateFormChange: (next: TutoringFormValues) => void;
  onFiltersChange: (next: Partial<TutoringSessionFilters>) => void;
  onMark: (id: string, status: TutoringAttendanceStatus) => void;
  onParamsChange: (params: { page?: number; pageSize?: string }) => void;
  onResetFilters: () => void;
}

interface Props {
  actions: TutoringSessionsActions;
  canManage: boolean;
  create: TutoringSessionsCreateState;
  exportQuery: ListTutoringSessionsParams;
  filters: TutoringSessionFilters;
  groups: UserGroup[];
  isLoading: boolean;
  isMarking: boolean;
  locale: string;
  pagination: TutoringSessionsPagination;
  sessions: TutoringSessionRecord[];
  students: WorkspaceBasicUserRecord[];
  wsId: string;
}

function SessionsEmptyState({
  canManage,
  isFiltered,
  onCreate,
  onReset,
}: {
  canManage: boolean;
  isFiltered: boolean;
  onCreate: () => void;
  onReset: () => void;
}) {
  const t = useTranslations('ws-tutoring');

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dynamic-purple/25 bg-dynamic-purple/10 text-dynamic-purple">
        <GraduationCap className="h-6 w-6" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">
          {isFiltered ? t('no_sessions_filtered') : t('no_sessions')}
        </p>
        <p className="mx-auto max-w-sm text-muted-foreground text-sm">
          {isFiltered
            ? t('no_sessions_filtered_description')
            : t('no_sessions_description')}
        </p>
      </div>
      {isFiltered ? (
        <Button onClick={onReset} variant="outline">
          {t('reset_filters')}
        </Button>
      ) : canManage ? (
        <Button onClick={onCreate}>
          <CalendarPlus className="h-4 w-4" />
          {t('create')}
        </Button>
      ) : null}
    </div>
  );
}

export function TutoringSessionsCard({
  actions,
  canManage,
  create,
  exportQuery,
  filters,
  groups,
  isLoading,
  isMarking,
  locale,
  pagination,
  sessions,
  students,
  wsId,
}: Props) {
  const t = useTranslations('ws-tutoring');
  const tCommon = useTranslations();
  const [parentMessageSession, setParentMessageSession] =
    useState<TutoringSessionRecord | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: TutoringExportFormat) => {
    setIsExporting(true);
    try {
      const rowCount = await runTutoringExport({
        format,
        query: exportQuery as Record<string, string | number | undefined>,
        wsId,
      });
      toast.success(t('export_ready', { count: rowCount }));
    } catch {
      toast.error(t('export_failed'));
    } finally {
      setIsExporting(false);
    }
  };

  const columns = ({ t: tableT }: { t: ReturnType<typeof useTranslations> }) =>
    buildTutoringSessionColumns({
      canManage,
      isMarking,
      locale,
      onMark: actions.onMark,
      onParentMessage: setParentMessageSession,
      t,
      tableT,
    });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-lg tracking-tight">
            {t('schedule_title')}
          </h3>
          <p className="text-muted-foreground text-sm">
            {t('schedule_description')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button disabled={isExporting} size="sm" variant="outline">
                <Download className="h-4 w-4" />
                {tCommon('common.export')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('export_scope')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {EXPORT_FORMATS.map((format) => (
                <DropdownMenuItem
                  key={format}
                  onClick={() => void handleExport(format)}
                >
                  {t(`export_${format.replace('-', '_')}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {canManage ? (
            <Button
              onClick={() => actions.onCreateDialogOpenChange(true)}
              size="sm"
            >
              <CalendarPlus className="h-4 w-4" />
              {t('create')}
            </Button>
          ) : null}
        </div>
      </div>

      <TutoringSessionFiltersBar
        filters={filters}
        groups={groups}
        onChange={actions.onFiltersChange}
        onReset={actions.onResetFilters}
        wsId={wsId}
      />

      <DataTable
        columnGenerator={columns}
        count={pagination.count}
        data={isLoading ? undefined : sessions}
        disableSearch
        emptyState={
          <SessionsEmptyState
            canManage={canManage}
            isFiltered={isTutoringSessionFiltered(filters)}
            onCreate={() => actions.onCreateDialogOpenChange(true)}
            onReset={actions.onResetFilters}
          />
        }
        hideToolbar
        namespace="tutoring-sessions-table"
        pageIndex={pagination.page > 0 ? pagination.page - 1 : 0}
        pageSize={pagination.pageSize}
        setParams={actions.onParamsChange}
        t={tCommon}
      />

      <Dialog
        onOpenChange={actions.onCreateDialogOpenChange}
        open={create.open}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('create_session')}</DialogTitle>
            <DialogDescription>{t('create_description')}</DialogDescription>
          </DialogHeader>
          <TutoringCreateCard
            form={create.form}
            groups={groups}
            isSubmitting={create.isSubmitting}
            onChange={actions.onCreateFormChange}
            onSubmit={actions.onCreate}
            students={students}
            wsId={wsId}
          />
        </DialogContent>
      </Dialog>

      <TutoringParentMessageDialog
        onOpenChange={(open) => !open && setParentMessageSession(null)}
        session={parentMessageSession}
        wsId={wsId}
      />
    </section>
  );
}

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarPlus,
  Download,
  GraduationCap,
  Loader2,
  RotateCcw,
} from '@tuturuuu/icons';
import type {
  TutoringAttendanceStatus,
  TutoringSessionRecord,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { updateTutoringSession } from '@tuturuuu/internal-api';
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
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
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
  error: string | null;
  filters: TutoringSessionFilters;
  groups: UserGroup[];
  isLoading: boolean;
  isRefreshing: boolean;
  isMarking: boolean;
  onRetry: () => void;
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
  error,
  filters,
  groups,
  isLoading,
  isRefreshing,
  isMarking,
  onRetry,
  locale,
  pagination,
  sessions,
  students,
  wsId,
}: Props) {
  const t = useTranslations('ws-tutoring');
  const tCommon = useTranslations();
  const queryClient = useQueryClient();
  const [parentMessageSession, setParentMessageSession] =
    useState<TutoringSessionRecord | null>(null);
  const [editingSession, setEditingSession] =
    useState<TutoringSessionRecord | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const updateContent = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      updateTutoringSession(wsId, id, { content }),
    onSuccess: () => {
      toast.success(t('content_updated'));
      setEditingSession(null);
      void queryClient.invalidateQueries({
        queryKey: ['tutoring-sessions', wsId],
      });
    },
    onError: () => toast.error(t('content_update_failed')),
  });

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
      onEditContent: (session) => {
        setEditingSession(session);
        setDraftContent(session.content);
      },
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
          {isRefreshing ? (
            <p
              className="flex items-center gap-1 text-muted-foreground text-xs"
              role="status"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              {tCommon('common.loading')}
            </p>
          ) : null}
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

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dynamic-red/25 bg-dynamic-red/5 px-4 py-10 text-center">
          <p className="font-medium text-sm">{error}</p>
          <Button onClick={onRetry} size="sm" variant="outline">
            <RotateCcw className="h-4 w-4" />
            {t('retry')}
          </Button>
        </div>
      ) : isLoading ? (
        <div
          aria-label={t('loading_sessions')}
          className="space-y-3 rounded-xl border p-4"
          role="status"
        >
          <div className="grid grid-cols-3 gap-3 border-b pb-3 md:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton className="h-4 w-full" key={index} />
            ))}
          </div>
          {Array.from({ length: 5 }, (_, index) => (
            <div
              className="grid grid-cols-3 gap-3 py-2 md:grid-cols-6"
              key={index}
            >
              {Array.from({ length: 6 }, (_, cell) => (
                <Skeleton className="h-5 w-full" key={cell} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <DataTable
          columnGenerator={columns}
          count={pagination.count}
          data={sessions}
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
      )}

      <Dialog
        onOpenChange={actions.onCreateDialogOpenChange}
        open={create.open}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
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
      <Dialog
        onOpenChange={(open) => {
          if (!open && !updateContent.isPending) setEditingSession(null);
        }}
        open={Boolean(editingSession)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('edit_content')}</DialogTitle>
            <DialogDescription>
              {t('edit_content_description')}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label={t('content')}
            maxLength={10_000}
            onChange={(event) => setDraftContent(event.target.value)}
            rows={6}
            value={draftContent}
          />
          <Button
            disabled={updateContent.isPending}
            onClick={() =>
              editingSession &&
              updateContent.mutate({
                id: editingSession.id,
                content: draftContent,
              })
            }
          >
            {t('save_content')}
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

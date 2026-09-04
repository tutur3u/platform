'use client';

import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Plus,
  User,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';

type ReportOption = {
  label: string;
  status?: string | null;
  value: string;
};

interface ReportWorkspaceToolbarProps {
  canCreateReports: boolean;
  currentUserIndex: number;
  isLoading: boolean;
  isPreparingBulkExport: boolean;
  onCreateReport: () => void;
  onExportAll: () => void;
  onExportApproved: () => void;
  onNextUser: () => void;
  onPreviousUser: () => void;
  onReportChange: (reportId: string) => void;
  onUserChange: (userId: string) => void;
  onUserSearchChange: (query: string) => void;
  reportId: string | null;
  reportOptions: ReportOption[];
  selectedUserOption?: ComboboxOption;
  totalUsers: number;
  userSearchHasMore: boolean;
  userSearchPending: boolean;
  userSearchTotal: number;
  userId: string | null;
  userOptions: ComboboxOption[];
}

function ReportStatusDot({ status }: { status?: string | null }) {
  const className =
    status === 'APPROVED'
      ? 'bg-dynamic-green'
      : status === 'REJECTED'
        ? 'bg-dynamic-red'
        : 'bg-dynamic-yellow';

  return <span className={`h-2 w-2 shrink-0 rounded-full ${className}`} />;
}

export function ReportWorkspaceToolbar({
  canCreateReports,
  currentUserIndex,
  isLoading,
  isPreparingBulkExport,
  onCreateReport,
  onExportAll,
  onExportApproved,
  onNextUser,
  onPreviousUser,
  onReportChange,
  onUserChange,
  onUserSearchChange,
  reportId,
  reportOptions,
  selectedUserOption,
  totalUsers,
  userSearchHasMore,
  userSearchPending,
  userSearchTotal,
  userId,
  userOptions,
}: ReportWorkspaceToolbarProps) {
  const t = useTranslations();

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b bg-muted/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-dynamic-blue/12 text-dynamic-blue">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">
              {t('ws-reports.report_workspace')}
            </h2>
            <p className="text-muted-foreground text-xs">
              {t('ws-reports.report_workspace_description')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {userId && canCreateReports ? (
            <Button type="button" className="gap-2" onClick={onCreateReport}>
              <Plus className="h-4 w-4" />
              {t('ws-reports.new_report')}
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={isPreparingBulkExport}
                className="gap-2"
              >
                {isPreparingBulkExport ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {t('ws-reports.export')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onExportAll}>
                {t('ws-reports.export_all_images')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportApproved}>
                {t('ws-reports.export_approved_images')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-3 p-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-medium text-muted-foreground text-xs">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-dynamic-blue/12 text-dynamic-blue">
              1
            </span>
            <User className="h-3.5 w-3.5" />
            {t('ws-reports.choose_user')}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label={t('ws-reports.previous_user')}
              disabled={isLoading || currentUserIndex <= 0}
              onClick={onPreviousUser}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Combobox
              t={t}
              key="user-combobox"
              options={userOptions}
              selected={userId ?? ''}
              label={
                currentUserIndex >= 0 &&
                totalUsers > 0 &&
                selectedUserOption ? (
                  <div className="flex min-w-0 items-center gap-2 text-left">
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate">
                        {selectedUserOption.label}
                      </span>
                      <span className="shrink-0">
                        {selectedUserOption.badge}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 font-medium text-[11px] text-muted-foreground leading-none">
                      {currentUserIndex + 1}/{totalUsers}
                    </span>
                  </div>
                ) : undefined
              }
              placeholder={t('user-data-table.user')}
              searchPlaceholder={t('ws-reports.search_users_placeholder')}
              emptyText={t('ws-reports.no_matching_users')}
              disabled={isLoading}
              shouldFilter={false}
              onSearchChange={onUserSearchChange}
              onOpenChange={(open) => {
                if (!open) onUserSearchChange('');
              }}
              onChange={(value) => {
                const nextUserId =
                  typeof value === 'string'
                    ? value
                    : Array.isArray(value)
                      ? value[0]
                      : '';
                onUserChange(nextUserId || '');
              }}
              className="min-w-0 flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label={t('ws-reports.next_user')}
              disabled={
                isLoading ||
                currentUserIndex < 0 ||
                currentUserIndex >= totalUsers - 1
              }
              onClick={onNextUser}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <p className="flex min-h-4 items-center gap-1.5 text-muted-foreground text-xs">
            {userSearchPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : null}
            {userSearchHasMore
              ? t('ws-reports.user_search_refine', {
                  count: userSearchTotal,
                })
              : t('ws-reports.user_search_count', {
                  count: totalUsers,
                })}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 font-medium text-muted-foreground text-xs">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-dynamic-blue/12 text-dynamic-blue">
              2
            </span>
            <FileText className="h-3.5 w-3.5" />
            {t('ws-reports.choose_report')}
          </div>
          <Select
            value={reportId ?? ''}
            onValueChange={onReportChange}
            disabled={isLoading || !userId}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('ws-reports.select_report')} />
            </SelectTrigger>
            <SelectContent>
              {canCreateReports ? (
                <SelectItem value="new">
                  <span className="flex items-center gap-2 font-medium text-dynamic-blue">
                    <Plus className="h-3.5 w-3.5" />
                    {t('ws-reports.new_report')}
                  </span>
                </SelectItem>
              ) : null}
              {reportOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span className="flex items-center gap-2">
                    <ReportStatusDot status={option.status} />
                    {option.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}

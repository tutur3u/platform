'use client';

import { Layers, Link, Link2Off, Search, Users } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Progress } from '@tuturuuu/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { XLSX } from '@tuturuuu/ui/xlsx';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { jsonToCSV } from 'react-papaparse';
import {
  type GroupMembershipFilter,
  getGroupMembershipTranslationKey,
} from './group-membership';

type ExportDataType = 'all-users' | 'users-with-promotions';
type UserStatus = 'active' | 'archived' | 'archived_until' | 'all';
type LinkStatus = 'all' | 'linked' | 'virtual';

interface SearchParams {
  q?: string;
  page?: number;
  pageSize?: number;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
  status?: UserStatus;
  linkStatus?: LinkStatus;
  groupMembership?: GroupMembershipFilter;
}

type ExportWorkspaceUser = WorkspaceUser & {
  is_guest?: boolean;
  linked_promotions_count?: number;
  linked_promotion_names?: string;
  linked_promotion_codes?: string;
  linked_promotion_values?: string;
};

interface WorkspaceUsersApiResponse {
  data: ExportWorkspaceUser[];
  count: number;
}

interface ExportPageResult {
  data: ExportWorkspaceUser[];
  count: number;
  scannedCount: number;
}

export default function ExportDialogContent({
  wsId,
  exportType = 'users',
  searchParams: searchParamsProp,
  showDataTypeSelector = false,
}: {
  wsId: string;
  exportType?: string;
  searchParams?: SearchParams;
  showDataTypeSelector?: boolean;
}) {
  const t = useTranslations();
  const urlSearchParams = useSearchParams();

  const searchParams = useMemo((): SearchParams => {
    if (searchParamsProp) {
      return {
        ...searchParamsProp,
        status: parseUserStatus(searchParamsProp.status),
        linkStatus: parseLinkStatus(searchParamsProp.linkStatus),
        groupMembership: parseGroupMembership(searchParamsProp.groupMembership),
      };
    }

    return {
      q: urlSearchParams.get('q') || undefined,
      includedGroups: urlSearchParams.getAll('includedGroups'),
      excludedGroups: urlSearchParams.getAll('excludedGroups'),
      status: parseUserStatus(urlSearchParams.get('status')),
      linkStatus: parseLinkStatus(urlSearchParams.get('linkStatus')),
      groupMembership: parseGroupMembership(
        urlSearchParams.get('groupMembership')
      ),
    };
  }, [searchParamsProp, urlSearchParams]);

  const [filename, setFilename] = useState('');
  const [exportFileType, setExportFileType] = useState('excel');
  const [exportDataType, setExportDataType] =
    useState<ExportDataType>('all-users');
  const [exportStatus, setExportStatus] = useState<UserStatus>(
    searchParams.status ?? 'active'
  );
  const [progress, setProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [processedUsers, setProcessedUsers] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);

  const effectiveExportType =
    showDataTypeSelector && exportDataType === 'users-with-promotions'
      ? 'users-with-promotions'
      : exportType;

  const includedGroups = useMemo(
    () => normalizeStringArray(searchParams.includedGroups),
    [searchParams.includedGroups]
  );
  const excludedGroups = useMemo(
    () => normalizeStringArray(searchParams.excludedGroups),
    [searchParams.excludedGroups]
  );
  const linkStatus = searchParams.linkStatus ?? 'all';
  const groupMembership = searchParams.groupMembership ?? 'all';

  useEffect(() => {
    setExportStatus(searchParams.status ?? 'active');
  }, [searchParams.status]);

  const defaultFilename = `${[
    effectiveExportType === 'users-with-promotions'
      ? 'users_with_promotions'
      : exportType,
    exportStatus !== 'active' ? exportStatus : null,
    linkStatus !== 'all' ? linkStatus : null,
    'export',
  ]
    .filter(Boolean)
    .join('_')}.${getFileExtension(exportFileType)}`;

  const handleExport = async () => {
    setIsExporting(true);
    setProgress(0);
    setProcessedUsers(0);
    setTotalUsers(0);
    setExportError(null);

    try {
      const allData: ExportWorkspaceUser[] = [];
      let currentPage = 1;
      const pageSize = 100;
      let scannedUsers = 0;
      let matchingUsers = 0;

      const fetchData =
        effectiveExportType === 'users-with-promotions'
          ? getUsersWithLinkedPromotions
          : getData;

      while (true) {
        const pageResult = await fetchData(wsId, {
          page: currentPage,
          pageSize,
          q: searchParams.q,
          includedGroups,
          excludedGroups,
          status: exportStatus,
          linkStatus,
          groupMembership,
        });

        matchingUsers = pageResult.count;
        scannedUsers += pageResult.scannedCount;

        setProcessedUsers(Math.min(scannedUsers, matchingUsers));
        setTotalUsers(matchingUsers);

        if (matchingUsers > 0) {
          setProgress(Math.min((scannedUsers / matchingUsers) * 100, 100));
        }

        allData.push(...pageResult.data);

        if (scannedUsers >= matchingUsers || pageResult.scannedCount === 0) {
          break;
        }

        currentPage++;
      }

      setProgress(100);

      if (exportFileType === 'csv') {
        downloadCSV(
          allData,
          `${(filename || defaultFilename).replace(/\.csv/g, '')}.csv`
        );
      } else if (exportFileType === 'excel') {
        downloadExcel(
          allData,
          `${(filename || defaultFilename).replace(/\.xlsx/g, '')}.xlsx`
        );
      }

      toast.success(t('common.export-success'));
    } catch (error) {
      const message =
        error instanceof Error && error.message !== 'EXPORT_ERROR'
          ? error.message
          : t('common.export-error');
      setExportError(message);
      toast.error(message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('common.export')}</DialogTitle>
        <DialogDescription>
          {t('ws-users.export_scope_description')}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="rounded-2xl border bg-muted/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium text-sm">
                {t('ws-users.export_scope_title')}
              </p>
              <p className="text-muted-foreground text-sm">
                {t('ws-users.export_scope_hint')}
              </p>
            </div>
            <Badge
              variant="secondary"
              className="rounded-full px-3 py-1 text-xs"
            >
              {t(`ws-users.${getStatusTranslationKey(exportStatus)}`)}
            </Badge>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <ScopeBadge
              icon={<Layers className="h-3.5 w-3.5" />}
              label={t('ws-users.status_filter')}
              value={t(`ws-users.${getStatusTranslationKey(exportStatus)}`)}
            />
            <ScopeBadge
              icon={getLinkStatusIcon(linkStatus)}
              label={t('ws-users.link_status_filter')}
              value={t(`ws-users.${getLinkStatusTranslationKey(linkStatus)}`)}
            />
            {groupMembership !== 'all' ? (
              <ScopeBadge
                icon={<Users className="h-3.5 w-3.5" />}
                label={t('ws-users.group_membership_filter')}
                value={t(
                  `ws-users.${getGroupMembershipTranslationKey(groupMembership)}`
                )}
              />
            ) : null}
            {searchParams.q ? (
              <ScopeBadge
                icon={<Search className="h-3.5 w-3.5" />}
                label={t('search.search')}
                value={searchParams.q}
              />
            ) : null}
            {includedGroups.length > 0 ? (
              <ScopeBadge
                icon={<Users className="h-3.5 w-3.5" />}
                label={t('user-data-table.included_groups')}
                value={t('ws-users.export_group_count', {
                  count: includedGroups.length,
                })}
              />
            ) : null}
            {excludedGroups.length > 0 ? (
              <ScopeBadge
                icon={<Users className="h-3.5 w-3.5" />}
                label={t('user-data-table.excluded_groups')}
                value={t('ws-users.export_group_count', {
                  count: excludedGroups.length,
                })}
              />
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid items-center gap-2">
            <Label htmlFor="statusScope">
              {t('ws-users.export_status_scope')}
            </Label>
            <Select
              value={exportStatus}
              onValueChange={(value) => setExportStatus(value as UserStatus)}
              disabled={isExporting}
            >
              <SelectTrigger id="statusScope" className="w-full">
                <SelectValue
                  placeholder={t('ws-users.export_status_scope_placeholder')}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">
                  {t('ws-users.status_active')}
                </SelectItem>
                <SelectItem value="archived">
                  {t('ws-users.status_archived')}
                </SelectItem>
                <SelectItem value="archived_until">
                  {t('ws-users.status_archived_until')}
                </SelectItem>
                <SelectItem value="all">{t('ws-users.status_all')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {t('ws-users.export_status_scope_hint')}
            </p>
          </div>

          <div className="grid items-center gap-2">
            <Label htmlFor="fileType">{t('common.file-type')}</Label>
            <Select
              value={exportFileType}
              onValueChange={setExportFileType}
              disabled={isExporting}
            >
              <SelectTrigger id="fileType" className="w-full">
                <SelectValue placeholder="File type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excel">Excel</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {showDataTypeSelector && (
          <div className="grid items-center gap-2">
            <Label htmlFor="dataType">{t('ws-users.export_data_type')}</Label>
            <Select
              value={exportDataType}
              onValueChange={(value) =>
                setExportDataType(value as ExportDataType)
              }
              disabled={isExporting}
            >
              <SelectTrigger id="dataType" className="w-full">
                <SelectValue
                  placeholder={t('ws-users.export_data_type_placeholder')}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-users">
                  {t('ws-users.export_all_users')}
                </SelectItem>
                <SelectItem value="users-with-promotions">
                  {t('ws-users.export_users_with_promotions')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid items-center gap-2">
          <Label htmlFor="filename">{t('common.file-name')}</Label>
          <Input
            type="text"
            id="filename"
            value={filename}
            placeholder={defaultFilename}
            onChange={(e) => setFilename(e.target.value)}
            className="w-full"
            disabled={isExporting}
          />
        </div>

        {exportError ? (
          <Alert variant="destructive">
            <AlertDescription>{exportError}</AlertDescription>
          </Alert>
        ) : null}

        {isExporting ? (
          <div className="space-y-2 rounded-2xl border bg-background/70 p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">
                {t('ws-users.export_progress_label')}
              </span>
              <span className="text-muted-foreground">
                {totalUsers > 0
                  ? t('ws-users.export_progress_value', {
                      processed: processedUsers,
                      total: totalUsers,
                    })
                  : t('common.processing')}
              </span>
            </div>
            <Progress value={progress} className="h-2 w-full" />
            <p className="text-muted-foreground text-xs">
              {t('ws-users.export_progress_hint')}
            </p>
          </div>
        ) : null}
      </div>

      <DialogFooter className="justify-between">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            {t('common.cancel')}
          </Button>
        </DialogClose>

        <Button onClick={handleExport} disabled={isExporting}>
          {isExporting ? t('common.processing') : t('common.export')}
        </Button>
      </DialogFooter>
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = 1,
    pageSize = 10,
    includedGroups = [],
    excludedGroups = [],
    status = 'active',
    linkStatus = 'all',
    groupMembership = 'all',
  }: SearchParams = {}
): Promise<ExportPageResult> {
  const response = await fetchWorkspaceUsersPage(wsId, {
    q,
    page,
    pageSize,
    includedGroups,
    excludedGroups,
    status,
    linkStatus,
    groupMembership,
  });

  return {
    data: response.data,
    count: response.count,
    scannedCount: response.data.length,
  };
}

async function getUsersWithLinkedPromotions(
  wsId: string,
  {
    q,
    page = 1,
    pageSize = 10,
    includedGroups = [],
    excludedGroups = [],
    status = 'active',
    linkStatus = 'all',
    groupMembership = 'all',
  }: SearchParams = {}
): Promise<ExportPageResult> {
  const response = await fetchWorkspaceUsersPage(wsId, {
    q,
    page,
    pageSize,
    includedGroups,
    excludedGroups,
    status,
    linkStatus,
    groupMembership,
    withPromotions: true,
  });

  return {
    data: response.data,
    count: response.count,
    scannedCount: response.data.length,
  };
}

async function fetchWorkspaceUsersPage(
  wsId: string,
  {
    q,
    page = 1,
    pageSize = 10,
    includedGroups = [],
    excludedGroups = [],
    status = 'active',
    linkStatus = 'all',
    groupMembership = 'all',
    withPromotions = false,
  }: SearchParams & { withPromotions?: boolean } = {}
): Promise<WorkspaceUsersApiResponse> {
  const searchParams = new URLSearchParams();

  if (q) {
    searchParams.set('q', q);
  }

  searchParams.set('page', String(page));
  searchParams.set('pageSize', String(pageSize));
  searchParams.set('status', status);
  searchParams.set('linkStatus', linkStatus);
  searchParams.set('groupMembership', groupMembership);
  if (withPromotions) {
    searchParams.set('withPromotions', 'true');
  }

  for (const group of normalizeStringArray(includedGroups)) {
    searchParams.append('includedGroups', group);
  }

  for (const group of normalizeStringArray(excludedGroups)) {
    searchParams.append('excludedGroups', group);
  }

  const response = await fetch(
    `/api/v1/workspaces/${wsId}/users/database?${searchParams.toString()}`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    const body = await response.text();
    const message = tidyExportErrorMessage(body);
    throw new Error(message || 'EXPORT_ERROR');
  }

  return (await response.json()) as WorkspaceUsersApiResponse;
}

function downloadCSV(data: ExportWorkspaceUser[], filename: string) {
  const csv = jsonToCSV(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function downloadExcel(data: ExportWorkspaceUser[], filename: string) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

  const excelBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function getFileExtension(fileType: string) {
  switch (fileType) {
    case 'csv':
      return 'csv';
    case 'excel':
      return 'xlsx';
    default:
      return '';
  }
}

function normalizeStringArray(value?: string | string[]) {
  if (!value) {
    return [];
  }

  return (Array.isArray(value) ? value : [value])
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function tidyExportErrorMessage(message: string) {
  const trimmed = message.trim();

  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      message?: string;
      error?: string;
    };

    return parsed.message || parsed.error || '';
  } catch {
    return '';
  }
}

function getStatusTranslationKey(status: UserStatus) {
  switch (status) {
    case 'archived':
      return 'status_archived';
    case 'archived_until':
      return 'status_archived_until';
    case 'all':
      return 'status_all';
    default:
      return 'status_active';
  }
}

function getLinkStatusTranslationKey(status: LinkStatus) {
  switch (status) {
    case 'linked':
      return 'link_status_linked';
    case 'virtual':
      return 'link_status_virtual';
    default:
      return 'link_status_all';
  }
}

function parseGroupMembership(
  value?: string | null
): GroupMembershipFilter | undefined {
  switch (value) {
    case 'all':
    case 'at-least-one':
    case 'exactly-one':
    case 'none':
      return value;
    default:
      return undefined;
  }
}

function getLinkStatusIcon(status: LinkStatus) {
  switch (status) {
    case 'linked':
      return <Link className="h-3.5 w-3.5" />;
    case 'virtual':
      return <Link2Off className="h-3.5 w-3.5" />;
    default:
      return <Users className="h-3.5 w-3.5" />;
  }
}

function parseUserStatus(value?: string | null): UserStatus {
  if (
    value === 'active' ||
    value === 'archived' ||
    value === 'archived_until' ||
    value === 'all'
  ) {
    return value;
  }

  return 'active';
}

function parseLinkStatus(value?: string | null): LinkStatus {
  if (value === 'all' || value === 'linked' || value === 'virtual') {
    return value;
  }

  return 'all';
}

function ScopeBadge({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs shadow-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

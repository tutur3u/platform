'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
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
import { XLSX } from '@tuturuuu/ui/xlsx';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { jsonToCSV } from 'react-papaparse';

interface SearchParams {
  q?: string;
  page?: number;
  pageSize?: number;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
}

type ExportDataType = 'all-users' | 'users-with-promotions';

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
  // Read search params from URL if not provided as props
  const urlSearchParams = useSearchParams();

  const searchParams = useMemo((): SearchParams => {
    // If props are provided, use them (backwards compatibility)
    if (searchParamsProp) return searchParamsProp;

    // Otherwise read from URL
    return {
      q: urlSearchParams.get('q') || undefined,
      includedGroups: urlSearchParams.getAll('includedGroups'),
      excludedGroups: urlSearchParams.getAll('excludedGroups'),
    };
  }, [searchParamsProp, urlSearchParams]);
  const t = useTranslations();
  const [filename, setFilename] = useState('');
  const [exportFileType, setExportFileType] = useState('excel');
  const [exportDataType, setExportDataType] =
    useState<ExportDataType>('all-users');
  const [progress, setProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  // Determine the effective export type (from selector or prop)
  const effectiveExportType =
    showDataTypeSelector && exportDataType === 'users-with-promotions'
      ? 'users-with-promotions'
      : exportType;

  const defaultFilename = `${effectiveExportType === 'users-with-promotions' ? 'users_with_promotions' : exportType}_export.${getFileExtension(exportFileType)}`;

  const downloadCSV = (data: any[], filename: string) => {
    const csv = jsonToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadExcel = (data: any[], filename: string) => {
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
  };

  const handleExport = async () => {
    setIsExporting(true);
    setProgress(0);

    const allData: WorkspaceUser[] = [];
    let currentPage = 1;
    const pageSize = 100;

    const includedGroups = Array.isArray(searchParams.includedGroups)
      ? searchParams.includedGroups
      : searchParams.includedGroups
        ? [searchParams.includedGroups]
        : [];
    const excludedGroups = Array.isArray(searchParams.excludedGroups)
      ? searchParams.excludedGroups
      : searchParams.excludedGroups
        ? [searchParams.excludedGroups]
        : [];

    // Select data fetcher based on export type
    const fetchData =
      effectiveExportType === 'users-with-promotions'
        ? getUsersWithLinkedPromotions
        : getData;

    while (true) {
      const { data } = await fetchData(wsId, {
        page: currentPage,
        pageSize: pageSize,
        q: searchParams.q,
        includedGroups,
        excludedGroups,
      });

      allData.push(...data);

      const progressValue =
        ((currentPage * pageSize) / (allData.length + 1)) * 100;
      setProgress(progressValue);

      if (data.length < pageSize) {
        setProgress(100);
        break;
      }

      currentPage++;
    }

    setProgress(100);

    if (exportFileType === 'csv') {
      downloadCSV(
        allData,
        `${(filename || defaultFilename)
          // remove all .csv from the filename
          .replace(/\.csv/g, '')}.csv`
      );
    } else if (exportFileType === 'excel') {
      downloadExcel(
        allData,
        `${(filename || defaultFilename)
          // remove all .xlsx from the filename
          .replace(/\.xlsx/g, '')}.xlsx`
      );
    }

    setIsExporting(false);
  };

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

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('common.export')}</DialogTitle>
        <DialogDescription>{t('common.export-content')}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-1">
        {showDataTypeSelector && (
          <div className="grid w-full max-w-sm items-center gap-2">
            <Label htmlFor="dataType">{t('ws-users.export_data_type')}</Label>
            <Select
              value={exportDataType}
              onValueChange={(value) =>
                setExportDataType(value as ExportDataType)
              }
              disabled={isExporting}
            >
              <SelectTrigger className="w-full">
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

        <div className="grid w-full max-w-sm items-center gap-2">
          <Label htmlFor="filename">{t('common.file-name')}</Label>
          <Input
            type="text"
            id="filename"
            value={filename}
            placeholder={defaultFilename}
            onChange={(e) => setFilename(e.target.value)}
            className="input-class w-full pb-4"
            disabled={isExporting}
          />
        </div>

        <div className="mt-2 grid w-full max-w-sm items-center gap-2">
          <Label htmlFor="fileType">{t('common.file-type')}</Label>
          <Select
            value={exportFileType}
            onValueChange={setExportFileType}
            disabled={isExporting}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="File type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="excel">Excel</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isExporting && (
          <div>
            <Progress value={progress} className="h-2 w-full" />
          </div>
        )}
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
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = createClient();

  const queryBuilder = supabase
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: Array.isArray(includedGroups)
          ? includedGroups
          : [includedGroups],
        excluded_groups: Array.isArray(excludedGroups)
          ? excludedGroups
          : [excludedGroups],
        search_query: q || '',
      },
      {
        count: 'exact',
      }
    )
    .select('*')
    .order('full_name', { ascending: true, nullsFirst: false });

  if (page && pageSize) {
    const parsedPage = page;
    const parsedSize = pageSize;
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize - 1;
    queryBuilder.range(start, end);
  }

  const { data, error } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getData(wsId, {
      q,
      page,
      pageSize,
      includedGroups,
      excludedGroups,
      retry: false,
    });
  }

  return { data } as unknown as { data: WorkspaceUser[] };
}

interface LinkedPromotionData {
  user_id: string;
  workspace_promotions: {
    id: string;
    name: string | null;
    code: string | null;
    value: number | null;
    use_ratio: boolean | null;
    ws_id: string;
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
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = createClient();

  // Fetch all linked promotions with full details for this workspace
  const { data: linkedPromotions, error: linkedError } = await supabase
    .from('user_linked_promotions')
    .select(
      `
      user_id,
      workspace_promotions!inner(id, name, code, value, use_ratio, ws_id)
    `
    )
    .eq('workspace_promotions.ws_id', wsId);

  if (linkedError) {
    if (!retry) throw linkedError;
    return getUsersWithLinkedPromotions(wsId, {
      q,
      page,
      pageSize,
      includedGroups,
      excludedGroups,
      retry: false,
    });
  }

  // Build a map of user_id -> promotions
  const userPromotionsMap = new Map<
    string,
    Array<{
      id: string;
      name: string | null;
      code: string | null;
      value: number | null;
      use_ratio: boolean | null;
    }>
  >();

  for (const item of (linkedPromotions || []) as LinkedPromotionData[]) {
    const userId = item.user_id;
    const promo = item.workspace_promotions;
    if (!userPromotionsMap.has(userId)) {
      userPromotionsMap.set(userId, []);
    }
    userPromotionsMap.get(userId)!.push({
      id: promo.id,
      name: promo.name,
      code: promo.code,
      value: promo.value,
      use_ratio: promo.use_ratio,
    });
  }

  // Extract unique user IDs
  const userIdsWithPromotions = [...userPromotionsMap.keys()];

  if (userIdsWithPromotions.length === 0) {
    return { data: [] as WorkspaceUser[] };
  }

  // Get workspace users filtered by those with promotions
  const queryBuilder = supabase
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: Array.isArray(includedGroups)
          ? includedGroups
          : [includedGroups],
        excluded_groups: Array.isArray(excludedGroups)
          ? excludedGroups
          : [excludedGroups],
        search_query: q || '',
      },
      {
        count: 'exact',
      }
    )
    .select('*')
    .in('id', userIdsWithPromotions)
    .order('full_name', { ascending: true, nullsFirst: false });

  if (page && pageSize) {
    const parsedPage = page;
    const parsedSize = pageSize;
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize - 1;
    queryBuilder.range(start, end);
  }

  const { data, error } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getUsersWithLinkedPromotions(wsId, {
      q,
      page,
      pageSize,
      includedGroups,
      excludedGroups,
      retry: false,
    });
  }

  // Enrich user data with promotion details
  const enrichedData = (data as unknown as WorkspaceUser[]).map((user) => {
    const promotions = userPromotionsMap.get(user.id) || [];
    return {
      ...user,
      linked_promotions_count: promotions.length,
      linked_promotion_names: promotions
        .map((p) => p.name || '')
        .filter(Boolean)
        .join(', '),
      linked_promotion_codes: promotions
        .map((p) => p.code || '')
        .filter(Boolean)
        .join(', '),
      linked_promotion_values: promotions
        .map((p) => {
          if (p.value === null) return '';
          return p.use_ratio ? `${p.value}%` : p.value.toString();
        })
        .filter(Boolean)
        .join(', '),
    };
  });

  return { data: enrichedData } as unknown as { data: WorkspaceUser[] };
}

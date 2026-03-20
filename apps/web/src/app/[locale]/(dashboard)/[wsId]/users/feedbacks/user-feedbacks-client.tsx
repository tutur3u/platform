'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  MessageSquarePlus,
  Pencil,
  RefreshCcw,
  Search,
  ShieldAlert,
  Trash2,
} from '@tuturuuu/icons';
import {
  createWorkspaceUserFeedback,
  deleteWorkspaceUserFeedback,
  listWorkspaceUserFeedbacks,
  updateWorkspaceUserFeedback,
  type WorkspaceUserFeedbackRecord,
} from '@tuturuuu/internal-api/users-feedbacks';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { XLSX } from '@tuturuuu/ui/xlsx';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { jsonToCSV } from 'react-papaparse';
import { RequireAttentionName } from '@/components/users/require-attention-name';
import { useInfiniteWorkspaceUserGroups } from '@/hooks/use-workspace-user-groups';

interface UserFeedbacksClientProps {
  wsId: string;
  canManageFeedbacks: boolean;
}

interface FeedbackFormValues {
  userId: string;
  groupId: string;
  content: string;
  require_attention: boolean;
}

type FeedbackDialogMode = 'create' | 'edit';

interface WorkspaceUserOptionData {
  id: string;
  full_name?: string | null;
  display_name?: string | null;
  email?: string | null;
}

const INITIAL_FORM_VALUES: FeedbackFormValues = {
  userId: '',
  groupId: '',
  content: '',
  require_attention: false,
};

function formatDate(value: string) {
  try {
    return format(new Date(value), 'PPP p');
  } catch {
    return value;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toExportRows(feedbacks: WorkspaceUserFeedbackRecord[]) {
  return feedbacks.map((feedback) => ({
    ID: feedback.id,
    'Target User': feedback.user_name,
    Group: feedback.group_name,
    Creator: feedback.creator_name,
    'Requires Attention': feedback.require_attention ? 'Yes' : 'No',
    Content: feedback.content,
    'Created At': feedback.created_at,
    'User ID': feedback.user_id,
    'Group ID': feedback.group_id,
    'Creator ID': feedback.creator_id ?? '',
  }));
}

const USERS_INFINITE_PAGE_SIZE = 50;

async function fetchWorkspaceUsersPage(
  wsId: string,
  {
    page = 1,
    query = '',
  }: {
    page?: number;
    query?: string;
  } = {}
) {
  const from = (page - 1) * USERS_INFINITE_PAGE_SIZE;
  const to = from + USERS_INFINITE_PAGE_SIZE - 1;
  const searchParams = new URLSearchParams({
    from: String(from),
    to: String(to),
    limit: String(USERS_INFINITE_PAGE_SIZE),
  });

  if (query.trim()) {
    searchParams.set('q', query.trim());
  }

  const response = await fetch(
    `/api/v1/workspaces/${wsId}/users?${searchParams.toString()}`,
    {
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch users');
  }

  const payload = (await response.json()) as {
    data?: WorkspaceUserOptionData[];
    count?: number;
  };

  return {
    data: payload.data ?? [],
    count: payload.count ?? 0,
    page,
  };
}

async function fetchWorkspaceUserById(wsId: string, userId: string) {
  const response = await fetch(`/api/v1/workspaces/${wsId}/users/${userId}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }

  return (await response.json()) as WorkspaceUserOptionData;
}

function getUserOptionLabel(
  user: WorkspaceUserOptionData,
  fallbackLabel: string
) {
  return (
    user.full_name?.trim() ||
    user.display_name?.trim() ||
    user.email?.trim() ||
    fallbackLabel
  );
}

function useInfiniteWorkspaceUsers(
  wsId: string,
  {
    query = '',
    ensureUserIds = [],
    enabled = true,
  }: {
    query?: string;
    ensureUserIds?: string[];
    enabled?: boolean;
  } = {}
) {
  const normalizedQuery = query.trim();
  const normalizedEnsureUserIds = [...new Set(ensureUserIds.filter(Boolean))];

  const infiniteQuery = useInfiniteQuery({
    queryKey: ['workspace-feedback-users-infinite', wsId, normalizedQuery],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchWorkspaceUsersPage(wsId, {
        page: pageParam,
        query: normalizedQuery,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce(
        (total, currentPage) => total + currentPage.data.length,
        0
      );

      if (loadedCount >= lastPage.count) {
        return undefined;
      }

      return allPages.length + 1;
    },
    enabled: !!wsId && enabled,
    staleTime: 5 * 60 * 1000,
  });

  const ensuredUsersQuery = useQuery({
    queryKey: [
      'workspace-feedback-users-selected',
      wsId,
      normalizedEnsureUserIds,
    ],
    queryFn: async () =>
      Promise.all(
        normalizedEnsureUserIds.map((selectedUserId) =>
          fetchWorkspaceUserById(wsId, selectedUserId)
        )
      ),
    enabled: !!wsId && enabled && normalizedEnsureUserIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const users = useMemo(() => {
    const mergedUsers = new Map<string, WorkspaceUserOptionData>();

    (ensuredUsersQuery.data ?? []).forEach((user) => {
      mergedUsers.set(user.id, user);
    });

    (infiniteQuery.data?.pages ?? []).forEach((currentPage) => {
      currentPage.data.forEach((user) => {
        mergedUsers.set(user.id, user);
      });
    });

    return [...mergedUsers.values()];
  }, [ensuredUsersQuery.data, infiniteQuery.data?.pages]);

  return {
    ...infiniteQuery,
    users,
  };
}

export function UserFeedbacksClient({
  wsId,
  canManageFeedbacks,
}: UserFeedbacksClientProps) {
  const t = useTranslations('ws-user-feedbacks');
  const commonT = useTranslations('common');
  const queryClient = useQueryClient();

  const [q, setQ] = useQueryState(
    'q',
    parseAsString.withDefault('').withOptions({
      shallow: true,
      throttleMs: 250,
    })
  );
  const [page, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({ shallow: true })
  );
  const [pageSize, setPageSize] = useQueryState(
    'pageSize',
    parseAsInteger.withDefault(10).withOptions({ shallow: true })
  );
  const [requireAttention, setRequireAttention] = useQueryState(
    'requireAttention',
    parseAsString.withDefault('all').withOptions({ shallow: true })
  );
  const [groupId, setGroupId] = useQueryState(
    'groupId',
    parseAsString.withDefault('').withOptions({ shallow: true })
  );
  const [userId, setUserId] = useQueryState(
    'userId',
    parseAsString.withDefault('').withOptions({ shallow: true })
  );
  const [creatorId, setCreatorId] = useQueryState(
    'creatorId',
    parseAsString.withDefault('').withOptions({ shallow: true })
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<FeedbackDialogMode>('create');
  const [editingFeedbackId, setEditingFeedbackId] = useState<string | null>(
    null
  );
  const [formValues, setFormValues] =
    useState<FeedbackFormValues>(INITIAL_FORM_VALUES);
  const [deletingFeedback, setDeletingFeedback] =
    useState<WorkspaceUserFeedbackRecord | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [filterGroupQuery, setFilterGroupQuery] = useState('');
  const [filterUserQuery, setFilterUserQuery] = useState('');
  const [filterCreatorQuery, setFilterCreatorQuery] = useState('');
  const [dialogGroupQuery, setDialogGroupQuery] = useState('');
  const [dialogUserQuery, setDialogUserQuery] = useState('');

  const listQuery = useQuery({
    queryKey: [
      'workspace-user-feedbacks',
      wsId,
      q,
      page,
      pageSize,
      requireAttention,
      groupId,
      userId,
      creatorId,
    ],
    queryFn: () =>
      listWorkspaceUserFeedbacks(wsId, {
        q: q || undefined,
        page,
        pageSize,
        requireAttention:
          requireAttention === 'true' || requireAttention === 'false'
            ? requireAttention
            : 'all',
        groupId: groupId || undefined,
        userId: userId || undefined,
        creatorId: creatorId || undefined,
      }),
    staleTime: 30 * 1000,
  });

  const filterGroupsQuery = useInfiniteWorkspaceUserGroups(wsId, {
    query: filterGroupQuery,
    ensureGroupIds: groupId ? [groupId] : [],
  });

  const dialogGroupsQuery = useInfiniteWorkspaceUserGroups(wsId, {
    query: dialogGroupQuery,
    ensureGroupIds: formValues.groupId ? [formValues.groupId] : [],
    enabled: dialogOpen,
  });

  const filterUsersQuery = useInfiniteWorkspaceUsers(wsId, {
    query: filterUserQuery,
    ensureUserIds: userId ? [userId] : [],
  });

  const filterCreatorsQuery = useInfiniteWorkspaceUsers(wsId, {
    query: filterCreatorQuery,
    ensureUserIds: creatorId ? [creatorId] : [],
  });

  const dialogUsersQuery = useInfiniteWorkspaceUsers(wsId, {
    query: dialogUserQuery,
    ensureUserIds: formValues.userId ? [formValues.userId] : [],
    enabled: dialogOpen,
  });

  const filterGroupOptions = useMemo<ComboboxOption[]>(
    () =>
      (filterGroupsQuery.data ?? []).map((group) => ({
        value: group.id,
        label: group.name?.trim() || t('unknown_group'),
      })),
    [filterGroupsQuery.data, t]
  );

  const dialogGroupOptions = useMemo<ComboboxOption[]>(
    () =>
      (dialogGroupsQuery.data ?? []).map((group) => ({
        value: group.id,
        label: group.name?.trim() || t('unknown_group'),
      })),
    [dialogGroupsQuery.data, t]
  );

  const filterUserOptions = useMemo<ComboboxOption[]>(
    () =>
      (filterUsersQuery.users ?? []).map((user) => ({
        value: user.id,
        label: getUserOptionLabel(user, t('unknown_user')),
        description:
          user.display_name && user.display_name !== user.full_name
            ? user.display_name
            : user.email || undefined,
      })),
    [filterUsersQuery.users, t]
  );

  const filterCreatorOptions = useMemo<ComboboxOption[]>(
    () =>
      (filterCreatorsQuery.users ?? []).map((user) => ({
        value: user.id,
        label: getUserOptionLabel(user, t('unknown_user')),
        description:
          user.display_name && user.display_name !== user.full_name
            ? user.display_name
            : user.email || undefined,
      })),
    [filterCreatorsQuery.users, t]
  );

  const dialogUserOptions = useMemo<ComboboxOption[]>(
    () =>
      (dialogUsersQuery.users ?? []).map((user) => ({
        value: user.id,
        label: getUserOptionLabel(user, t('unknown_user')),
        description:
          user.display_name && user.display_name !== user.full_name
            ? user.display_name
            : user.email || undefined,
      })),
    [dialogUsersQuery.users, t]
  );

  const invalidateFeedbacks = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['workspace-user-feedbacks', wsId],
    });
    await queryClient.invalidateQueries({
      queryKey: ['user-feedbacks'],
    });
  };

  const createMutation = useMutation({
    mutationFn: async () =>
      createWorkspaceUserFeedback(wsId, {
        userId: formValues.userId,
        groupId: formValues.groupId,
        content: formValues.content,
        require_attention: formValues.require_attention,
      }),
    onSuccess: async () => {
      toast.success(t('feedback_created_successfully'));
      setDialogOpen(false);
      setFormValues(INITIAL_FORM_VALUES);
      await invalidateFeedbacks();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('save_error'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingFeedbackId) {
        throw new Error('Missing feedback ID');
      }

      return updateWorkspaceUserFeedback(wsId, editingFeedbackId, {
        content: formValues.content,
        require_attention: formValues.require_attention,
      });
    },
    onSuccess: async () => {
      toast.success(t('feedback_updated_successfully'));
      setDialogOpen(false);
      setEditingFeedbackId(null);
      setFormValues(INITIAL_FORM_VALUES);
      await invalidateFeedbacks();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('save_error'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (feedbackId: string) =>
      deleteWorkspaceUserFeedback(wsId, feedbackId),
    onSuccess: async () => {
      toast.success(t('feedback_deleted_successfully'));
      setDeletingFeedback(null);
      await invalidateFeedbacks();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('delete_error'));
    },
  });

  const feedbacks = listQuery.data?.data ?? [];
  const totalCount = listQuery.data?.count ?? 0;
  const totalPages = listQuery.data?.totalPages ?? 1;
  const canPreviousPage = page > 1;
  const canNextPage = page < totalPages;
  const hasActiveFilters = Boolean(
    q || groupId || userId || creatorId || requireAttention !== 'all'
  );

  const resetFilters = async () => {
    await Promise.all([
      setQ(null),
      setPage(1),
      setPageSize(10),
      setRequireAttention('all'),
      setGroupId(null),
      setUserId(null),
      setCreatorId(null),
    ]);
  };

  const openCreateDialog = () => {
    setDialogMode('create');
    setEditingFeedbackId(null);
    setFormValues(INITIAL_FORM_VALUES);
    setDialogOpen(true);
  };

  const openEditDialog = (feedback: WorkspaceUserFeedbackRecord) => {
    setDialogMode('edit');
    setEditingFeedbackId(feedback.id);
    setFormValues({
      userId: feedback.user_id,
      groupId: feedback.group_id,
      content: feedback.content,
      require_attention: feedback.require_attention,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formValues.content.trim()) {
      toast.error(t('content_required'));
      return;
    }

    if (
      dialogMode === 'create' &&
      (!formValues.userId || !formValues.groupId)
    ) {
      toast.error(t('user_group_required'));
      return;
    }

    if (dialogMode === 'create') {
      await createMutation.mutateAsync();
      return;
    }

    await updateMutation.mutateAsync();
  };

  const handleExport = async (format: 'csv' | 'excel') => {
    setIsExporting(true);

    try {
      const pageSizeForExport = 100;
      let nextPage = 1;
      let total = Number.POSITIVE_INFINITY;
      const rows: WorkspaceUserFeedbackRecord[] = [];

      while (rows.length < total) {
        const response = await listWorkspaceUserFeedbacks(wsId, {
          q: q || undefined,
          page: nextPage,
          pageSize: pageSizeForExport,
          requireAttention:
            requireAttention === 'true' || requireAttention === 'false'
              ? requireAttention
              : 'all',
          groupId: groupId || undefined,
          userId: userId || undefined,
          creatorId: creatorId || undefined,
        });

        rows.push(...response.data);
        total = response.count;

        if (response.data.length < pageSizeForExport) {
          break;
        }

        nextPage += 1;
      }

      const exportRows = toExportRows(rows);
      const fileStem = `user-feedbacks-${new Date().toISOString().slice(0, 10)}`;

      if (format === 'csv') {
        const csv = jsonToCSV(exportRows);
        downloadBlob(
          new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
          `${fileStem}.csv`
        );
      } else {
        const worksheet = XLSX.utils.json_to_sheet(exportRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Feedbacks');
        const excelBuffer = XLSX.write(workbook, {
          bookType: 'xlsx',
          type: 'array',
        });
        downloadBlob(
          new Blob([excelBuffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
          `${fileStem}.xlsx`
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('export_error'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="font-semibold text-2xl">{t('title')}</h1>
          <p className="max-w-3xl text-muted-foreground text-sm">
            {t('description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleExport('csv')}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {t('export_csv')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleExport('excel')}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            {t('export_excel')}
          </Button>
          {canManageFeedbacks && (
            <Button type="button" onClick={openCreateDialog}>
              <MessageSquarePlus className="h-4 w-4" />
              {t('add_feedback')}
            </Button>
          )}
        </div>
      </div>

      <Card className="border-border/60 shadow-none">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            {t('filters')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-4">
            <div className="relative lg:col-span-2">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(event) => {
                  void setQ(event.target.value || null);
                  void setPage(1);
                }}
                placeholder={t('search_placeholder')}
                className="pl-9"
              />
            </div>
            <Select
              value={requireAttention}
              onValueChange={(value) => {
                void setRequireAttention(value);
                void setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('requires_attention')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all_attention_states')}</SelectItem>
                <SelectItem value="true">{t('attention_only')}</SelectItem>
                <SelectItem value="false">{t('non_attention_only')}</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                void setPageSize(Number(value));
                void setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Combobox
              options={filterGroupOptions}
              selected={groupId}
              onChange={(value) => {
                void setGroupId((value as string) || null);
                void setPage(1);
              }}
              placeholder={t('filter_by_group')}
              searchPlaceholder={t('search_groups')}
              emptyText={t('no_groups_found')}
              onSearchChange={setFilterGroupQuery}
              hasMore={Boolean(filterGroupsQuery.hasNextPage)}
              onLoadMore={() => {
                if (!filterGroupsQuery.isFetchingNextPage) {
                  void filterGroupsQuery.fetchNextPage();
                }
              }}
              loadingMore={filterGroupsQuery.isFetchingNextPage}
            />
            <Combobox
              options={filterUserOptions}
              selected={userId}
              onChange={(value) => {
                void setUserId((value as string) || null);
                void setPage(1);
              }}
              placeholder={t('filter_by_user')}
              searchPlaceholder={t('search_users')}
              emptyText={t('no_users_found')}
              onSearchChange={setFilterUserQuery}
              hasMore={Boolean(filterUsersQuery.hasNextPage)}
              onLoadMore={() => {
                if (!filterUsersQuery.isFetchingNextPage) {
                  void filterUsersQuery.fetchNextPage();
                }
              }}
              loadingMore={filterUsersQuery.isFetchingNextPage}
            />
            <Combobox
              options={filterCreatorOptions}
              selected={creatorId}
              onChange={(value) => {
                void setCreatorId((value as string) || null);
                void setPage(1);
              }}
              placeholder={t('filter_by_creator')}
              searchPlaceholder={t('search_users')}
              emptyText={t('no_users_found')}
              onSearchChange={setFilterCreatorQuery}
              hasMore={Boolean(filterCreatorsQuery.hasNextPage)}
              onLoadMore={() => {
                if (!filterCreatorsQuery.isFetchingNextPage) {
                  void filterCreatorsQuery.fetchNextPage();
                }
              }}
              loadingMore={filterCreatorsQuery.isFetchingNextPage}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              {t('showing_feedbacks', {
                start: totalCount === 0 ? 0 : (page - 1) * pageSize + 1,
                end: Math.min(page * pageSize, totalCount),
                total: totalCount,
              })}
            </p>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void resetFilters()}
              >
                <RefreshCcw className="h-4 w-4" />
                {t('clear_filters')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {listQuery.isError ? (
        <Card className="border-dynamic-red/20 bg-dynamic-red/5">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-dynamic-red" />
            <div className="space-y-1">
              <p className="font-medium text-dynamic-red">{t('load_error')}</p>
              <p className="text-muted-foreground text-sm">
                {listQuery.error instanceof Error
                  ? listQuery.error.message
                  : t('load_error')}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : listQuery.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : feedbacks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <MessageSquarePlus className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">{t('no_feedbacks_found')}</p>
              <p className="text-muted-foreground text-sm">
                {t('no_feedbacks_description')}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {feedbacks.map((feedback) => (
            <Card
              key={feedback.id}
              className="overflow-hidden border-border/60"
            >
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <RequireAttentionName
                        name={feedback.user_name}
                        requireAttention={feedback.require_attention}
                        className="font-semibold text-base"
                      />
                      <Badge variant="secondary">{feedback.group_name}</Badge>
                      {feedback.require_attention && (
                        <Badge className="border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange">
                          <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                          {t('requires_attention')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {t.rich('created_meta', {
                        date: formatDate(feedback.created_at),
                        creator: () => (
                          <RequireAttentionName
                            name={feedback.creator_name}
                            requireAttention={feedback.require_attention}
                          />
                        ),
                      })}
                    </p>
                  </div>
                  {canManageFeedbacks && (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(feedback)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletingFeedback(feedback)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <Separator />
                <p className="whitespace-pre-wrap text-sm leading-6">
                  {feedback.content}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          {t('page_of', { current: page, total: totalPages })}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void setPage(page - 1)}
            disabled={!canPreviousPage}
          >
            {t('previous')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void setPage(page + 1)}
            disabled={!canNextPage}
          >
            {t('next')}
          </Button>
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingFeedbackId(null);
            setFormValues(INITIAL_FORM_VALUES);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create'
                ? t('create_feedback')
                : t('edit_feedback')}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'create'
                ? t('create_feedback_description')
                : t('edit_feedback_description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('target_user')}</Label>
                <Combobox
                  options={dialogUserOptions}
                  selected={formValues.userId}
                  onChange={(value) =>
                    setFormValues((current) => ({
                      ...current,
                      userId: value as string,
                    }))
                  }
                  placeholder={t('select_user')}
                  searchPlaceholder={t('search_users')}
                  emptyText={t('no_users_found')}
                  disabled={dialogMode === 'edit'}
                  onSearchChange={setDialogUserQuery}
                  hasMore={Boolean(dialogUsersQuery.hasNextPage)}
                  onLoadMore={() => {
                    if (!dialogUsersQuery.isFetchingNextPage) {
                      void dialogUsersQuery.fetchNextPage();
                    }
                  }}
                  loadingMore={dialogUsersQuery.isFetchingNextPage}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('group')}</Label>
                <Combobox
                  options={dialogGroupOptions}
                  selected={formValues.groupId}
                  onChange={(value) =>
                    setFormValues((current) => ({
                      ...current,
                      groupId: value as string,
                    }))
                  }
                  placeholder={t('select_group')}
                  searchPlaceholder={t('search_groups')}
                  emptyText={t('no_groups_found')}
                  disabled={dialogMode === 'edit'}
                  onSearchChange={setDialogGroupQuery}
                  hasMore={Boolean(dialogGroupsQuery.hasNextPage)}
                  onLoadMore={() => {
                    if (!dialogGroupsQuery.isFetchingNextPage) {
                      void dialogGroupsQuery.fetchNextPage();
                    }
                  }}
                  loadingMore={dialogGroupsQuery.isFetchingNextPage}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-content">{t('feedback_content')}</Label>
              <Textarea
                id="feedback-content"
                rows={6}
                value={formValues.content}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    content: event.target.value,
                  }))
                }
                placeholder={t('feedback_content_placeholder')}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div className="space-y-1">
                <p className="font-medium text-sm">{t('requires_attention')}</p>
                <p className="text-muted-foreground text-xs">
                  {t('requires_attention_description')}
                </p>
              </div>
              <Switch
                checked={formValues.require_attention}
                onCheckedChange={(checked) =>
                  setFormValues((current) => ({
                    ...current,
                    require_attention: checked,
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              {commonT('cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {dialogMode === 'create'
                ? t('create_feedback')
                : t('save_changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deletingFeedback)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingFeedback(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('delete_feedback_title')}</DialogTitle>
            <DialogDescription>
              {t('delete_feedback_description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingFeedback(null)}
            >
              {commonT('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                deletingFeedback
                  ? deleteMutation.mutate(deletingFeedback.id)
                  : undefined
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {commonT('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  MessageSquarePlus,
  Pencil,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { RequireAttentionName } from '@/components/users/require-attention-name';
import { useInfiniteWorkspaceUserGroups } from '@/hooks/use-workspace-user-groups';

interface UserFeedbackPanelUser {
  id: string;
  full_name?: string | null;
  display_name?: string | null;
  has_require_attention_feedback?: boolean | null;
}

interface UserFeedbackPanelProps {
  wsId: string;
  user: UserFeedbackPanelUser;
  canManageFeedbacks: boolean;
  className?: string;
}

interface CreateFeedbackFormValues {
  groupId: string;
  content: string;
  require_attention: boolean;
}

interface UpdateFeedbackFormValues {
  content: string;
  require_attention: boolean;
}

const FEEDBACKS_PAGE_SIZE = 5;

const DEFAULT_CREATE_FORM_VALUES: CreateFeedbackFormValues = {
  groupId: '',
  content: '',
  require_attention: false,
};

const DEFAULT_UPDATE_FORM_VALUES: UpdateFeedbackFormValues = {
  content: '',
  require_attention: false,
};

function formatFeedbackDate(value: string) {
  try {
    return format(new Date(value), 'PPP p');
  } catch {
    return value;
  }
}

export function UserFeedbackPanel({
  wsId,
  user,
  canManageFeedbacks,
  className,
}: UserFeedbackPanelProps) {
  const tUsers = useTranslations('ws-users');
  const tFeedback = useTranslations('ws-user-feedbacks');
  const commonT = useTranslations('common');
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [groupQuery, setGroupQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createValues, setCreateValues] = useState<CreateFeedbackFormValues>(
    DEFAULT_CREATE_FORM_VALUES
  );
  const [editingFeedbackId, setEditingFeedbackId] = useState<string | null>(
    null
  );
  const [updateValues, setUpdateValues] = useState<UpdateFeedbackFormValues>(
    DEFAULT_UPDATE_FORM_VALUES
  );
  const [feedbackToDelete, setFeedbackToDelete] =
    useState<WorkspaceUserFeedbackRecord | null>(null);

  const feedbacksQuery = useQuery({
    queryKey: ['workspace-user-feedbacks', wsId, user.id, page],
    queryFn: () =>
      listWorkspaceUserFeedbacks(wsId, {
        userId: user.id,
        page,
        pageSize: FEEDBACKS_PAGE_SIZE,
      }),
    enabled: !!wsId && !!user.id,
    staleTime: 30 * 1000,
  });

  const attentionQuery = useQuery({
    queryKey: ['workspace-user-feedbacks-attention', wsId, user.id],
    queryFn: () =>
      listWorkspaceUserFeedbacks(wsId, {
        userId: user.id,
        requireAttention: 'true',
        page: 1,
        pageSize: 1,
      }),
    enabled: !!wsId && !!user.id,
    staleTime: 30 * 1000,
  });

  const groupsQuery = useInfiniteWorkspaceUserGroups(wsId, {
    query: groupQuery,
    enabled: canManageFeedbacks && showCreateForm,
    ensureGroupIds: createValues.groupId ? [createValues.groupId] : [],
  });

  const groupOptions = useMemo<ComboboxOption[]>(
    () =>
      (groupsQuery.data ?? []).map((group) => ({
        value: group.id,
        label: group.name,
      })),
    [groupsQuery.data]
  );

  const invalidateFeedbackData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['workspace-user-feedbacks', wsId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['workspace-user-feedbacks-attention', wsId, user.id],
      }),
      queryClient.invalidateQueries({
        queryKey: ['workspace-users', wsId],
      }),
    ]);
  };

  const createFeedbackMutation = useMutation({
    mutationFn: () =>
      createWorkspaceUserFeedback(wsId, {
        userId: user.id,
        groupId: createValues.groupId,
        content: createValues.content.trim(),
        require_attention: createValues.require_attention,
      }),
    onSuccess: async () => {
      toast.success(tFeedback('feedback_created_successfully'));
      setPage(1);
      setCreateValues(DEFAULT_CREATE_FORM_VALUES);
      setShowCreateForm(false);
      await invalidateFeedbackData();
    },
    onError: () => {
      toast.error(tFeedback('save_error'));
    },
  });

  const updateFeedbackMutation = useMutation({
    mutationFn: (feedbackId: string) =>
      updateWorkspaceUserFeedback(wsId, feedbackId, {
        content: updateValues.content.trim(),
        require_attention: updateValues.require_attention,
      }),
    onSuccess: async () => {
      toast.success(tFeedback('feedback_updated_successfully'));
      setEditingFeedbackId(null);
      setUpdateValues(DEFAULT_UPDATE_FORM_VALUES);
      await invalidateFeedbackData();
    },
    onError: () => {
      toast.error(tFeedback('save_error'));
    },
  });

  const deleteFeedbackMutation = useMutation({
    mutationFn: (feedbackId: string) =>
      deleteWorkspaceUserFeedback(wsId, feedbackId),
    onSuccess: async () => {
      toast.success(tFeedback('feedback_deleted_successfully'));
      setFeedbackToDelete(null);
      await invalidateFeedbackData();
    },
    onError: () => {
      toast.error(tFeedback('delete_error'));
    },
  });

  const feedbacks = feedbacksQuery.data?.data ?? [];
  const totalCount = feedbacksQuery.data?.count ?? 0;
  const totalPages = Math.max(feedbacksQuery.data?.totalPages ?? 1, 1);
  const attentionCount = attentionQuery.data?.count ?? 0;
  const requiresAttention =
    attentionCount > 0 || !!user.has_require_attention_feedback;
  const displayName =
    user.full_name?.trim() ||
    user.display_name?.trim() ||
    tFeedback('unknown_user');
  const isMutating =
    createFeedbackMutation.isPending ||
    updateFeedbackMutation.isPending ||
    deleteFeedbackMutation.isPending;

  const handleCreateSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!createValues.groupId || !createValues.content.trim()) {
      toast.error(
        !createValues.groupId
          ? tFeedback('user_group_required')
          : tFeedback('content_required')
      );
      return;
    }

    await createFeedbackMutation.mutateAsync();
  };

  const handleUpdateSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
    feedbackId: string
  ) => {
    event.preventDefault();

    if (!updateValues.content.trim()) {
      toast.error(tFeedback('content_required'));
      return;
    }

    await updateFeedbackMutation.mutateAsync(feedbackId);
  };

  const startEditing = (feedback: WorkspaceUserFeedbackRecord) => {
    setEditingFeedbackId(feedback.id);
    setUpdateValues({
      content: feedback.content,
      require_attention: feedback.require_attention,
    });
  };

  return (
    <>
      <Card className={cn('border-border/60 bg-background/95', className)}>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="flex flex-wrap items-center gap-2">
                {tUsers('feedback_support_title')}
                {requiresAttention ? (
                  <Badge className="border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange">
                    <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                    {tFeedback('requires_attention')}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    <CheckCircle className="mr-1 h-3.5 w-3.5" />
                    {tUsers('attention_none')}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                {tUsers('feedback_support_description')}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary">{displayName}</Badge>
                <Badge variant="outline">
                  {tUsers('feedback_records_description', {
                    count: totalCount,
                  })}
                </Badge>
                <Badge variant="outline">
                  {tUsers('feedback_queue_description', {
                    count: attentionCount,
                  })}
                </Badge>
              </div>
            </div>

            {canManageFeedbacks ? (
              <Button
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => {
                  setShowCreateForm((current) => !current);
                  setEditingFeedbackId(null);
                }}
              >
                <MessageSquarePlus className="mr-2 h-4 w-4" />
                {tFeedback('add_feedback')}
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {canManageFeedbacks && showCreateForm ? (
            <form
              onSubmit={handleCreateSubmit}
              className="space-y-4 rounded-2xl border border-border/60 bg-muted/20 p-4"
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,220px)_1fr]">
                <div className="space-y-2">
                  <Label>{tFeedback('group')}</Label>
                  <Combobox
                    options={groupOptions}
                    selected={createValues.groupId}
                    onChange={(value) =>
                      setCreateValues((current) => ({
                        ...current,
                        groupId: String(value),
                      }))
                    }
                    placeholder={tFeedback('select_group')}
                    searchPlaceholder={tFeedback('search_groups')}
                    emptyText={tFeedback('no_groups_found')}
                    onSearchChange={setGroupQuery}
                    hasMore={!!groupsQuery.hasNextPage}
                    onLoadMore={() => {
                      if (groupsQuery.hasNextPage && !groupsQuery.isFetching) {
                        void groupsQuery.fetchNextPage();
                      }
                    }}
                    loadingMore={groupsQuery.isFetchingNextPage}
                    loadMoreText={commonT('load_more')}
                    loadingMoreText={commonT('loading')}
                    disabled={groupsQuery.isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="workspace-user-feedback-content">
                    {tFeedback('feedback_content')}
                  </Label>
                  <Textarea
                    id="workspace-user-feedback-content"
                    value={createValues.content}
                    onChange={(event) =>
                      setCreateValues((current) => ({
                        ...current,
                        content: event.target.value,
                      }))
                    }
                    placeholder={tFeedback('feedback_content_placeholder')}
                    rows={4}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="font-medium text-sm">
                    {tFeedback('requires_attention')}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {tFeedback('requires_attention_description')}
                  </div>
                </div>
                <Switch
                  checked={createValues.require_attention}
                  onCheckedChange={(checked) =>
                    setCreateValues((current) => ({
                      ...current,
                      require_attention: checked,
                    }))
                  }
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateValues(DEFAULT_CREATE_FORM_VALUES);
                  }}
                >
                  {commonT('cancel')}
                </Button>
                <Button type="submit" disabled={isMutating}>
                  {createFeedbackMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {tFeedback('create_feedback')}
                </Button>
              </div>
            </form>
          ) : null}

          {feedbacksQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/60 py-10 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {commonT('loading')}
            </div>
          ) : feedbacks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border/60 border-dashed py-10 text-center">
              {requiresAttention ? (
                <AlertCircle className="h-8 w-8 text-dynamic-orange" />
              ) : (
                <CheckCircle className="h-8 w-8 text-muted-foreground" />
              )}
              <div className="font-medium">
                {tFeedback('no_feedbacks_found')}
              </div>
              <div className="max-w-md text-muted-foreground text-sm">
                {canManageFeedbacks
                  ? tFeedback('no_feedbacks_description')
                  : tUsers('feedback_support_description')}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {feedbacks.map((feedback) => {
                const isEditing = editingFeedbackId === feedback.id;

                return (
                  <div
                    key={feedback.id}
                    className="rounded-2xl border border-border/60 bg-background/80 p-4"
                  >
                    {isEditing ? (
                      <form
                        onSubmit={(event) =>
                          handleUpdateSubmit(event, feedback.id)
                        }
                        className="space-y-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">
                            {feedback.group_name}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-muted-foreground"
                          >
                            {formatFeedbackDate(feedback.created_at)}
                          </Badge>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`feedback-edit-${feedback.id}`}>
                            {tFeedback('feedback_content')}
                          </Label>
                          <Textarea
                            id={`feedback-edit-${feedback.id}`}
                            value={updateValues.content}
                            onChange={(event) =>
                              setUpdateValues((current) => ({
                                ...current,
                                content: event.target.value,
                              }))
                            }
                            rows={4}
                          />
                        </div>

                        <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="space-y-1">
                            <div className="font-medium text-sm">
                              {tFeedback('requires_attention')}
                            </div>
                            <div className="text-muted-foreground text-xs">
                              {tFeedback('requires_attention_description')}
                            </div>
                          </div>
                          <Switch
                            checked={updateValues.require_attention}
                            onCheckedChange={(checked) =>
                              setUpdateValues((current) => ({
                                ...current,
                                require_attention: checked,
                              }))
                            }
                          />
                        </div>

                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setEditingFeedbackId(null);
                              setUpdateValues(DEFAULT_UPDATE_FORM_VALUES);
                            }}
                          >
                            {commonT('cancel')}
                          </Button>
                          <Button type="submit" disabled={isMutating}>
                            {updateFeedbackMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            {tFeedback('save_changes')}
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">
                                {feedback.group_name}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="text-muted-foreground"
                              >
                                {formatFeedbackDate(feedback.created_at)}
                              </Badge>
                              {feedback.require_attention ? (
                                <Badge className="border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange">
                                  <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                                  {tFeedback('requires_attention')}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="text-muted-foreground text-sm">
                              {tFeedback.rich('created_meta', {
                                creator: () => (
                                  <RequireAttentionName
                                    name={feedback.creator_name}
                                    requireAttention={
                                      feedback.require_attention
                                    }
                                    className="font-medium text-foreground"
                                  />
                                ),
                                date: formatFeedbackDate(feedback.created_at),
                              })}
                            </div>
                          </div>

                          {canManageFeedbacks ? (
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => startEditing(feedback)}
                              >
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">
                                  {tFeedback('edit_feedback')}
                                </span>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setFeedbackToDelete(feedback)}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">
                                  {tFeedback('delete_feedback_title')}
                                </span>
                              </Button>
                            </div>
                          ) : null}
                        </div>

                        <Separator />

                        <div
                          className={cn(
                            'whitespace-pre-wrap text-sm leading-6',
                            feedback.require_attention &&
                              'rounded-xl border border-dynamic-orange/20 bg-dynamic-orange/5 px-3 py-2'
                          )}
                        >
                          {feedback.content}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 ? (
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-muted-foreground text-sm">
                {tFeedback('page_of', {
                  current: page,
                  total: totalPages,
                })}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(current - 1, 1))}
                  disabled={page === 1 || feedbacksQuery.isFetching}
                >
                  {tFeedback('previous')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((current) => Math.min(current + 1, totalPages))
                  }
                  disabled={page >= totalPages || feedbacksQuery.isFetching}
                >
                  {tFeedback('next')}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!feedbackToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setFeedbackToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tFeedback('delete_feedback_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tFeedback('delete_feedback_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteFeedbackMutation.isPending}>
              {commonT('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();

                if (feedbackToDelete) {
                  void deleteFeedbackMutation.mutateAsync(feedbackToDelete.id);
                }
              }}
              disabled={deleteFeedbackMutation.isPending}
            >
              {deleteFeedbackMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {commonT('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

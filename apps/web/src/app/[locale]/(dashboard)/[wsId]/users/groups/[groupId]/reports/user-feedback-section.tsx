'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MessageSquarePlus,
  Pencil,
  ShieldUserIcon,
  Trash2,
} from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
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
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { RequireAttentionName } from '@/components/users/require-attention-name';

interface UserFeedbackSectionProps {
  user: WorkspaceUser | null;
  groupName: string;
  wsId: string;
  groupId: string;
  canEditFeedback?: boolean;
  canDeleteFeedback?: boolean;
}

interface FeedbackFormData {
  content: string;
  require_attention: boolean;
}

interface UserFeedback {
  id: string;
  content: string;
  require_attention: boolean;
  created_at: string;
  creator_id: string | null;
  creator: {
    full_name: string | null;
    display_name: string | null;
  } | null;
}

interface FeedbackHistoryResponse {
  data: UserFeedback[];
  count: number;
  hasMore: boolean;
}

export default function UserFeedbackSection({
  user,
  wsId,
  groupId,
  canEditFeedback = false,
  canDeleteFeedback = false,
}: UserFeedbackSectionProps) {
  const t = useTranslations();
  const tFeedback = useTranslations('ws-user-group-feedback');
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<FeedbackFormData>({
    content: '',
    require_attention: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Edit state
  const [editingFeedbackId, setEditingFeedbackId] = useState<string | null>(
    null
  );
  const [editFormData, setEditFormData] = useState<FeedbackFormData>({
    content: '',
    require_attention: false,
  });

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [feedbackToDelete, setFeedbackToDelete] = useState<string | null>(null);

  const FEEDBACKS_PER_PAGE = 3;

  // Query for fetching feedback history
  const { data: feedbackHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['user-feedbacks', user?.id, groupId, currentPage],
    queryFn: async (): Promise<FeedbackHistoryResponse> => {
      if (!user) return { data: [], count: 0, hasMore: false };

      const from = (currentPage - 1) * FEEDBACKS_PER_PAGE;
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/members/${user.id}/feedbacks?offset=${from}&limit=${FEEDBACKS_PER_PAGE}`,
        { cache: 'no-store' }
      );

      if (!res.ok) throw new Error('Failed to fetch feedback history');
      return await res.json();
    },
    enabled: !!user && isOpen,
    staleTime: 30000,
  });

  const feedbacks = feedbackHistory?.data || [];
  const totalCount = feedbackHistory?.count || 0;
  const hasMore = feedbackHistory?.hasMore || false;

  // Reset pagination when user changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: user?.id is intentionally included to reset currentPage when user context changes
  useEffect(() => {
    setCurrentPage(1);
    setShowAddForm(false);
    setFormData({ content: '', require_attention: false });
    setEditingFeedbackId(null);
  }, [user?.id]);

  // Mutation for creating feedback
  const createFeedbackMutation = useMutation({
    mutationFn: async (data: FeedbackFormData) => {
      if (!user) throw new Error('No user selected');

      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/members/${user.id}/feedbacks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to create feedback');
      }
    },
    onSuccess: () => {
      toast.success(tFeedback('feedback_created_successfully'));
      setFormData({ content: '', require_attention: false });
      setShowAddForm(false);
      queryClient.invalidateQueries({
        queryKey: ['user-feedbacks', user?.id, groupId],
      });
    },
    onError: (error) => {
      console.error('Error creating feedback:', error);
      toast.error(tFeedback('failed_to_create_feedback'));
    },
  });

  // Mutation for updating feedback
  const updateFeedbackMutation = useMutation({
    mutationFn: async ({
      feedbackId,
      data,
    }: {
      feedbackId: string;
      data: FeedbackFormData;
    }) => {
      if (!user) throw new Error('No user selected');

      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/members/${user.id}/feedbacks?feedbackId=${feedbackId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to update feedback');
      }
    },
    onSuccess: () => {
      toast.success(tFeedback('feedback_updated_successfully'));
      setEditingFeedbackId(null);
      setEditFormData({ content: '', require_attention: false });
      queryClient.invalidateQueries({
        queryKey: ['user-feedbacks', user?.id, groupId],
      });
    },
    onError: (error) => {
      console.error('Error updating feedback:', error);
      toast.error(tFeedback('failed_to_update_feedback'));
    },
  });

  // Mutation for deleting feedback
  const deleteFeedbackMutation = useMutation({
    mutationFn: async (feedbackId: string) => {
      if (!user) throw new Error('No user selected');

      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/members/${user.id}/feedbacks?feedbackId=${feedbackId}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to delete feedback');
      }
    },
    onSuccess: () => {
      toast.success(tFeedback('feedback_deleted_successfully'));
      setDeleteDialogOpen(false);
      setFeedbackToDelete(null);
      queryClient.invalidateQueries({
        queryKey: ['user-feedbacks', user?.id, groupId],
      });
    },
    onError: (error) => {
      console.error('Error deleting feedback:', error);
      toast.error(tFeedback('failed_to_delete_feedback'));
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.content.trim()) {
      toast.error(tFeedback('content_required'));
      return;
    }

    setIsSubmitting(true);
    try {
      await createFeedbackMutation.mutateAsync(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFormData.content.trim() || !editingFeedbackId) {
      toast.error(tFeedback('content_required'));
      return;
    }

    await updateFeedbackMutation.mutateAsync({
      feedbackId: editingFeedbackId,
      data: editFormData,
    });
  };

  const startEditing = (feedback: UserFeedback) => {
    setEditingFeedbackId(feedback.id);
    setEditFormData({
      content: feedback.content,
      require_attention: feedback.require_attention,
    });
  };

  const cancelEditing = () => {
    setEditingFeedbackId(null);
    setEditFormData({ content: '', require_attention: false });
  };

  const confirmDelete = (feedbackId: string) => {
    setFeedbackToDelete(feedbackId);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (feedbackToDelete) {
      await deleteFeedbackMutation.mutateAsync(feedbackToDelete);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (hasMore) {
      setCurrentPage(currentPage + 1);
    }
  };

  const getCreatorName = (feedback: UserFeedback) => {
    if (feedback.creator?.full_name) return feedback.creator.full_name;
    if (feedback.creator?.display_name) return feedback.creator.display_name;
    return 'Unknown User';
  };

  const formatFeedbackDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'd MMMM, yyyy', { locale: vi });
    } catch {
      return new Date(dateString).toLocaleDateString();
    }
  };

  if (!user) return null;

  return (
    <>
      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className="rounded-lg border"
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="flex w-full items-center justify-between p-4"
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">
                {tFeedback('user_feedback')}
              </span>
              {totalCount > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs tabular-nums">
                  {totalCount}
                </span>
              )}
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="px-4 pb-4">
          {/* Add Feedback Button/Form */}
          {!showAddForm ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(true)}
              className="mb-4 w-full border-dashed"
            >
              <MessageSquarePlus className="mr-2 h-4 w-4" />
              {tFeedback('add_feedback')}
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="mb-4 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="feedback-content" className="text-xs">
                  {tFeedback('feedback_content')} *
                </Label>
                <Textarea
                  id="feedback-content"
                  value={formData.content}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      content: e.target.value,
                    }))
                  }
                  placeholder={tFeedback('feedback_content_placeholder')}
                  rows={3}
                  className="resize-none text-sm"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="require-attention-inline"
                  checked={formData.require_attention}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      require_attention: checked,
                    }))
                  }
                />
                <Label htmlFor="require-attention-inline" className="text-xs">
                  {tFeedback('requires_attention')}
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting || !formData.content.trim()}
                  className="flex-1"
                >
                  {isSubmitting
                    ? tFeedback('creating')
                    : tFeedback('create_feedback')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowAddForm(false);
                    setFormData({ content: '', require_attention: false });
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          )}

          <Separator className="mb-4" />

          {/* Feedback History */}
          {isLoadingHistory ? (
            <div className="py-4 text-center text-muted-foreground text-sm">
              {tFeedback('loading_feedbacks')}
            </div>
          ) : feedbacks.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground text-sm">
              <p>{tFeedback('no_feedbacks_found')}</p>
              <p className="mt-1 text-xs">
                {tFeedback('no_feedbacks_description')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {feedbacks.map((feedback, index) => (
                <div
                  key={feedback.id}
                  className="rounded-lg border bg-background p-3"
                >
                  {editingFeedbackId === feedback.id ? (
                    // Edit form
                    <form onSubmit={handleEditSubmit} className="space-y-3">
                      <div className="space-y-2">
                        <Textarea
                          value={editFormData.content}
                          onChange={(e) =>
                            setEditFormData((prev) => ({
                              ...prev,
                              content: e.target.value,
                            }))
                          }
                          rows={3}
                          className="resize-none text-sm"
                        />
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          id={`edit-attention-${feedback.id}`}
                          checked={editFormData.require_attention}
                          onCheckedChange={(checked) =>
                            setEditFormData((prev) => ({
                              ...prev,
                              require_attention: checked,
                            }))
                          }
                        />
                        <Label
                          htmlFor={`edit-attention-${feedback.id}`}
                          className="text-xs"
                        >
                          {tFeedback('requires_attention')}
                        </Label>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="submit"
                          size="sm"
                          disabled={
                            updateFeedbackMutation.isPending ||
                            !editFormData.content.trim()
                          }
                          className="flex-1"
                        >
                          {updateFeedbackMutation.isPending
                            ? t('common.saving')
                            : t('common.save')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={cancelEditing}
                        >
                          {t('common.cancel')}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    // Display mode
                    <div className="flex items-start gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs">
                        {feedbacks.length - index}
                      </div>

                      <div className="flex-1 space-y-2">
                        <p className="wrap-break-word whitespace-pre-wrap text-sm leading-relaxed">
                          {feedback.content}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                          <span>{formatFeedbackDate(feedback.created_at)}</span>
                          <div className="flex items-center gap-1">
                            {feedback.require_attention ? (
                              <>
                                <AlertCircle className="h-3 w-3 text-dynamic-red" />
                                <span className="text-dynamic-red">
                                  {tFeedback('requires_attention')}
                                </span>
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-3 w-3 text-dynamic-green" />
                                <span className="text-dynamic-green">
                                  {tFeedback('ok')}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-dynamic-blue">
                            <ShieldUserIcon className="h-3 w-3" />
                            <RequireAttentionName
                              name={getCreatorName(feedback)}
                              requireAttention={feedback.require_attention}
                              className="max-w-32 truncate"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Edit/Delete buttons */}
                      {(canEditFeedback || canDeleteFeedback) && (
                        <div className="flex items-center gap-1">
                          {canEditFeedback && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditing(feedback)}
                              className="h-7 w-7 p-0"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDeleteFeedback && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => confirmDelete(feedback.id)}
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Pagination Controls */}
              {totalCount > FEEDBACKS_PER_PAGE && (
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-muted-foreground text-xs">
                    {tFeedback('showing_feedbacks', {
                      start: (currentPage - 1) * FEEDBACKS_PER_PAGE + 1,
                      end: Math.min(
                        currentPage * FEEDBACKS_PER_PAGE,
                        totalCount
                      ),
                      total: totalCount,
                    })}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePreviousPage}
                      disabled={currentPage === 1}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-muted-foreground text-xs">
                      {currentPage}/{Math.ceil(totalCount / FEEDBACKS_PER_PAGE)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleNextPage}
                      disabled={!hasMore}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
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
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFeedbackMutation.isPending
                ? t('common.deleting')
                : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

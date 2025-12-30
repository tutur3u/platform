'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ShieldUserIcon,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface UserFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: WorkspaceUser | null;
  groupName: string;
  wsId: string;
  groupId: string;
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

export default function UserFeedbackDialog({
  open,
  onOpenChange,
  user,
  groupName,
  wsId,
  groupId,
}: UserFeedbackDialogProps) {
  const t = useTranslations();
  const tFeedback = useTranslations('ws-user-group-feedback');
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('add');
  const [formData, setFormData] = useState<FeedbackFormData>({
    content: '',
    require_attention: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const FEEDBACKS_PER_PAGE = 3;

  // Query for fetching feedback history
  const { data: feedbackHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['user-feedbacks', user?.id, groupId, currentPage],
    queryFn: async (): Promise<FeedbackHistoryResponse> => {
      if (!user) return { data: [], count: 0, hasMore: false };

      const from = (currentPage - 1) * FEEDBACKS_PER_PAGE;
      const to = from + FEEDBACKS_PER_PAGE - 1;

      const { data, error, count } = await supabase
        .from('user_feedbacks')
        .select(
          `
          id,
          content,
          require_attention,
          created_at,
          creator_id,
          workspace_users!user_feedbacks_creator_id_fkey(
            full_name,
            display_name
          )
        `,
          { count: 'exact' }
        )
        .eq('user_id', user.id)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const feedbacksWithCreator =
        data?.map((feedback) => ({
          ...feedback,
          creator: feedback.workspace_users
            ? {
                full_name: feedback.workspace_users.full_name,
                display_name: feedback.workspace_users.display_name,
              }
            : null,
        })) || [];

      return {
        data: feedbacksWithCreator,
        count: count || 0,
        hasMore: (count || 0) > to + 1,
      };
    },
    enabled: !!user,
    staleTime: 30000, // 30 seconds
  });

  // Extract data from query result
  const feedbacks = feedbackHistory?.data || [];
  const totalCount = feedbackHistory?.count || 0;
  const hasMore = feedbackHistory?.hasMore || false;

  // Reset pagination when user changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: user?.id is intentionally included to reset currentPage when user context changes, even though it's not used inside the effect
  useEffect(() => {
    setCurrentPage(1);
    // Don't reset feedbacks, totalCount, and hasMore here - let React Query handle the data
    // The query will automatically refetch when user?.id changes due to the queryKey dependency
  }, [user?.id]);

  // Mutation for creating feedback
  const createFeedbackMutation = useMutation({
    mutationFn: async (data: FeedbackFormData) => {
      if (!user) throw new Error('No user selected');

      // Get the current user's workspace user ID
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) throw new Error('User not authenticated');

      const { data: workspaceUser, error: workspaceUserError } = await supabase
        .from('workspace_user_linked_users')
        .select('virtual_user_id')
        .eq('platform_user_id', authUser.id)
        .eq('ws_id', wsId)
        .single();

      if (workspaceUserError) throw workspaceUserError;
      if (!workspaceUser) throw new Error('User not found in workspace');

      const { error } = await supabase.from('user_feedbacks').insert({
        user_id: user.id,
        group_id: groupId,
        content: data.content.trim(),
        require_attention: data.require_attention,
        creator_id: workspaceUser.virtual_user_id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tFeedback('feedback_created_successfully'));
      setFormData({ content: '', require_attention: false });
      // Invalidate all feedback history queries for this user and group
      queryClient.invalidateQueries({
        queryKey: ['user-feedbacks', user?.id, groupId],
      });
    },
    onError: (error) => {
      console.error('Error creating feedback:', error);
      toast.error(tFeedback('failed_to_create_feedback'));
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

  const handleClose = () => {
    setFormData({ content: '', require_attention: false });
    setActiveTab('add');
    setCurrentPage(1);
    onOpenChange(false);
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
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[80vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{tFeedback('user_feedback')}</DialogTitle>
          <DialogDescription>
            {tFeedback('user_feedback_description', {
              userName: user.full_name || '',
              groupName,
            })}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex w-full flex-1 flex-col overflow-hidden"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="add">{tFeedback('add_feedback')}</TabsTrigger>
            <TabsTrigger value="view">
              {tFeedback('view_feedbacks')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="add" className="flex-1 space-y-4 overflow-y-auto">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Read-only user and group info */}
              <div className="grid grid-cols-1 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>{t('ws-users.full_name')}</Label>
                  <div className="rounded-md bg-muted px-3 py-2 text-sm">
                    {user.full_name || ''}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t('ws-user-groups.singular')}</Label>
                  <div className="rounded-md bg-muted px-3 py-2 text-sm">
                    {groupName}
                  </div>
                </div>
              </div>

              {/* Feedback content */}
              <div className="space-y-2">
                <Label htmlFor="feedback-content">
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
                  rows={4}
                  className="resize-none"
                />
              </div>

              {/* Requires attention switch */}
              <div className="flex items-center space-x-2">
                <Switch
                  id="require-attention"
                  checked={formData.require_attention}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      require_attention: checked,
                    }))
                  }
                />
                <Label htmlFor="require-attention">
                  {tFeedback('requires_attention')}
                </Label>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !formData.content.trim()}
                >
                  {isSubmitting
                    ? tFeedback('creating')
                    : tFeedback('create_feedback')}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent
            value="view"
            className="flex-1 space-y-4 overflow-y-auto"
          >
            {isLoadingHistory ? (
              <div className="py-8 text-center text-muted-foreground">
                <p>{tFeedback('loading_feedbacks')}</p>
              </div>
            ) : feedbacks.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <p>{tFeedback('no_feedbacks_found')}</p>
                <p className="text-sm">
                  {tFeedback('no_feedbacks_description')}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Feedback Timeline */}
                <div className="space-y-6">
                  {feedbacks.map((feedback, index) => (
                    <div key={feedback.id} className="relative">
                      {/* Timeline line - only between items, not after the last one */}
                      {index < feedbacks.length - 1 && (
                        <div
                          className="absolute left-4 z-0 w-px bg-muted-foreground/60"
                          style={{
                            left: '15px',
                            top: '32px', // Start after current circle
                            height: 'calc(100% + 24px)', // Extend to next item (space-y-6 = 24px)
                          }}
                        />
                      )}

                      {/* Feedback item */}
                      <div className="flex gap-4">
                        {/* Timeline number */}
                        <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-sm">
                          {feedbacks.length - index}
                        </div>

                        {/* Feedback content */}
                        <div className="flex-1 space-y-2">
                          <div className="max-h-40 overflow-y-auto rounded-lg border bg-card p-4">
                            <p className="wrap-break-word whitespace-pre-wrap text-sm leading-relaxed">
                              {feedback.content}
                            </p>
                          </div>

                          {/* Feedback metadata */}
                          <div className="flex flex-col gap-2 text-muted-foreground text-sm sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>
                                {formatFeedbackDate(feedback.created_at)}
                              </span>
                              <span>•</span>
                              <div className="flex items-center gap-1">
                                {feedback.require_attention ? (
                                  <>
                                    <AlertCircle className="h-4 w-4 text-dynamic-red" />
                                    <span className="text-dynamic-red">
                                      {tFeedback('requires_attention')}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="h-4 w-4 text-dynamic-green" />
                                    <span className="text-dynamic-green">
                                      {tFeedback('ok')}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex max-w-sm items-center gap-1 truncate text-dynamic-blue">
                              <ShieldUserIcon className="h-4 w-4" />{' '}
                              {getCreatorName(feedback)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination Controls */}
                {totalCount > FEEDBACKS_PER_PAGE && (
                  <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-muted-foreground text-sm">
                      {tFeedback('showing_feedbacks', {
                        start: (currentPage - 1) * FEEDBACKS_PER_PAGE + 1,
                        end: Math.min(
                          currentPage * FEEDBACKS_PER_PAGE,
                          totalCount
                        ),
                        total: totalCount,
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePreviousPage}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">
                          {tFeedback('previous')}
                        </span>
                      </Button>
                      <span className="whitespace-nowrap text-muted-foreground text-sm">
                        {tFeedback('page_of', {
                          current: currentPage,
                          total: Math.ceil(totalCount / FEEDBACKS_PER_PAGE),
                        })}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNextPage}
                        disabled={!hasMore}
                      >
                        <span className="hidden sm:inline">
                          {tFeedback('next')}
                        </span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Send,
  X,
} from '@tuturuuu/icons';
import {
  getMeetAssistantReview,
  respondMeetAssistantReview,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { AssistantToolPreview } from './assistant-tool-preview';
import { ChatMessageBody } from './chat-message-body';
import { MiraAvatar } from './mira-profile';

export function AssistantPrivateReview({
  meetingId,
  selfUserId,
  messageId,
}: {
  meetingId: string;
  selfUserId: string | null;
  messageId: string;
}) {
  const t = useTranslations('meet.call');
  const queryClient = useQueryClient();
  const key = ['meet-assistant-reviews', meetingId, selfUserId];
  const detail = useQuery({
    queryKey: [...key, messageId],
    queryFn: () => getMeetAssistantReview(meetingId, messageId),
    enabled: !!selfUserId,
    retry: false,
    gcTime: 0,
    refetchInterval: (query) =>
      query.state.data?.status === 'executing' ? 3000 : false,
  });
  const mutation = useMutation({
    mutationFn: ({
      action,
      revision,
    }: {
      action: 'approve' | 'deny' | 'share' | 'discard';
      revision: number;
    }) => respondMeetAssistantReview(meetingId, messageId, revision, action),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const review = detail.data;
  const revision = review?.revision;
  const act = (action: 'approve' | 'deny' | 'share' | 'discard') => {
    if (revision === undefined || mutation.isPending) return;
    mutation.mutate({ action, revision });
  };
  const actionable =
    review?.status === 'ready' && !mutation.isPending && !detail.isFetching;
  return (
    <section
      aria-label={t('assistant_private_reviews')}
      className="@container mt-3 min-w-0 overflow-hidden rounded-xl border-2 border-primary/30 bg-primary/5 shadow-sm"
    >
      <header className="flex items-start gap-2.5 border-primary/15 border-b p-3">
        <MiraAvatar size={28} />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="font-semibold text-sm">
            {t(
              review?.status === 'ready' && review.approvals.length
                ? 'assistant_decision_needed'
                : 'assistant_private_reviews'
            )}
          </h3>
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <LockKeyhole aria-hidden className="size-3" />
            {t('assistant_only_you')}
          </Badge>
        </div>
      </header>
      <div className="space-y-3 p-3">
        <p className="text-muted-foreground text-xs leading-relaxed">
          {t('assistant_review_description')}
        </p>
        {detail.isPending ? (
          <div role="status" className="space-y-2">
            <span className="sr-only">{t('assistant_review_loading')}</span>
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : detail.isError ? (
          <div role="alert" className="space-y-2 text-sm">
            <p>{t('assistant_review_failed')}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void detail.refetch()}
            >
              <RefreshCw className="size-3.5" />
              {t('assistant_review_retry')}
            </Button>
          </div>
        ) : (
          review && (
            <>
              <p className="break-words text-muted-foreground text-xs">
                {t('assistant_workspace')}:{' '}
                <span className="font-medium text-foreground">
                  {review.workspaceName}
                </span>{' '}
                · {review.timezone}
              </p>
              {review.text && <ChatMessageBody body={review.text} assistant />}
              {review.approvals.map((approval) => (
                <section
                  key={approval.id}
                  className="min-w-0 space-y-2 rounded-lg border bg-background/80 p-3"
                >
                  <h4 className="font-medium text-sm capitalize">
                    {approval.toolName.replaceAll('_', ' ')}
                  </h4>
                  <AssistantToolPreview
                    input={approval.input}
                    timezone={review.timezone}
                  />
                </section>
              ))}
              {['executing', 'interrupted'].includes(review.status) && (
                <p role="status" className="text-muted-foreground text-xs">
                  {t('assistant_review_processing')}
                </p>
              )}
              {mutation.isError && (
                <p role="alert" className="text-destructive text-xs">
                  {t('assistant_review_failed')}
                </p>
              )}
              {mutation.isPending && (
                <p
                  role="status"
                  className="flex items-center gap-2 text-muted-foreground text-xs"
                >
                  <Loader2 className="size-3.5 animate-spin" />
                  {t('assistant_decision_saving')}
                </p>
              )}
              <div className="grid @xs:grid-cols-2 grid-cols-1 gap-2">
                {review.status === 'interrupted' ? (
                  <Button
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() => act('discard')}
                  >
                    <X className="size-4" />
                    {t('assistant_discard_draft')}
                  </Button>
                ) : review.approvals.length ? (
                  <>
                    <Button
                      disabled={!actionable}
                      onClick={() => act('approve')}
                    >
                      <Check className="size-4" />
                      {t('assistant_approve_actions')}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!actionable}
                      onClick={() => act('deny')}
                    >
                      <X className="size-4" />
                      {t('assistant_deny_actions')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      disabled={!actionable || !review.text.trim()}
                      onClick={() => act('share')}
                    >
                      <Send className="size-4" />
                      {t('assistant_share_draft')}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!actionable}
                      onClick={() => act('discard')}
                    >
                      <X className="size-4" />
                      {t('assistant_discard_draft')}
                    </Button>
                  </>
                )}
              </div>
            </>
          )
        )}
      </div>
    </section>
  );
}

'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, Loader2, LockKeyhole, Send, X } from '@tuturuuu/icons';
import {
  getMeetAssistantReview,
  listMeetAssistantReviews,
  respondMeetAssistantReview,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AssistantToolPreview } from './assistant-tool-preview';
import { MiraAvatar } from './mira-profile';

const Markdown = dynamic(
  () =>
    import('@tuturuuu/ui/chat/ai-message-markdown').then(
      (m) => m.AssistantMarkdown
    ),
  { ssr: false }
);
export function AssistantPrivateReviews({
  meetingId,
  selfUserId,
}: {
  meetingId: string;
  selfUserId: string | null;
}) {
  const t = useTranslations('meet.call');
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const key = ['meet-assistant-reviews', meetingId, selfUserId];
  const list = useQuery({
    queryKey: key,
    queryFn: () => listMeetAssistantReviews(meetingId),
    enabled: !!selfUserId,
    retry: false,
  });
  const detail = useQuery({
    queryKey: [...key, selected],
    queryFn: () => getMeetAssistantReview(meetingId, selected!),
    enabled: !!selected,
    retry: false,
    gcTime: 0,
  });
  const mutation = useMutation({
    mutationFn: ({
      action,
      messageId,
      revision,
    }: {
      action: 'approve' | 'deny' | 'share' | 'discard';
      messageId: string;
      revision: number;
    }) => respondMeetAssistantReview(meetingId, messageId, revision, action),
    onSuccess: async (_, { action, messageId }) => {
      await queryClient.invalidateQueries({ queryKey: key });
      if (action === 'share' || action === 'discard')
        setSelected((current) => (current === messageId ? null : current));
    },
    onError: () => {
      toast.error(t('assistant_review_failed'));
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  if (!list.data?.length && !selected) return null;
  const review = detail.data;
  const act = (action: 'approve' | 'deny' | 'share' | 'discard') =>
    mutation.mutate({
      action,
      messageId: selected!,
      revision: detail.data!.revision,
    });
  const actionable = review?.status === 'ready' && !mutation.isPending;
  return (
    <>
      <div className="space-y-2 border-b bg-muted/20 p-3">
        <p className="flex items-center gap-2 text-muted-foreground text-xs">
          <LockKeyhole className="size-3.5" />
          {t('assistant_private_reviews')}
        </p>
        {list.data?.map((item, index) => (
          <Button
            key={item.id}
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => setSelected(item.id)}
          >
            <Eye className="size-4" />
            {t('assistant_review_number', { number: index + 1 })}
          </Button>
        ))}
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MiraAvatar size={24} />
              {t('assistant_private_reviews')}
            </DialogTitle>
            <DialogDescription>
              {t('assistant_review_description')}
            </DialogDescription>
          </DialogHeader>
          {detail.isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : detail.isError ? (
            <p role="alert">{t('assistant_review_failed')}</p>
          ) : (
            review && (
              <>
                <Badge variant="secondary" className="w-fit gap-1">
                  <LockKeyhole className="size-3" />
                  {t('assistant_only_you')}
                </Badge>
                <p className="text-muted-foreground text-sm">
                  {t('assistant_workspace')}: {review.workspaceName} ·{' '}
                  {review.timezone}
                </p>
                {review.text && <Markdown text={review.text} />}
                {review.approvals.map((approval) => (
                  <section
                    key={approval.id}
                    className="min-w-0 space-y-2 rounded-xl border p-3"
                  >
                    <h3 className="font-medium capitalize">
                      {approval.toolName.replaceAll('_', ' ')}
                    </h3>
                    <AssistantToolPreview
                      input={approval.input}
                      timezone={review.timezone}
                    />
                  </section>
                ))}
                {['executing', 'interrupted'].includes(review.status) && (
                  <p role="status" className="text-muted-foreground text-sm">
                    {t('assistant_review_processing')}
                  </p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
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
                        variant="outline"
                        disabled={!actionable}
                        onClick={() => act('deny')}
                      >
                        <X className="size-4" />
                        {t('assistant_deny_actions')}
                      </Button>
                      <Button
                        disabled={!actionable}
                        onClick={() => act('approve')}
                      >
                        <Check className="size-4" />
                        {t('assistant_approve_actions')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        disabled={!actionable}
                        onClick={() => act('discard')}
                      >
                        <X className="size-4" />
                        {t('assistant_discard_draft')}
                      </Button>
                      <Button
                        disabled={!actionable || !review.text}
                        onClick={() => act('share')}
                      >
                        <Send className="size-4" />
                        {t('assistant_share_draft')}
                      </Button>
                    </>
                  )}
                </div>
              </>
            )
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

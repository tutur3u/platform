import { MessageSquarePlus, ShieldAlert } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

interface UsersAttentionSupportPanelProps {
  wsId: string;
  attentionCount: number;
  feedbackCount: number;
}

export async function UsersAttentionSupportPanel({
  wsId,
  attentionCount,
  feedbackCount,
}: UsersAttentionSupportPanelProps) {
  const tUsers = await getTranslations('ws-users');
  const tFeedback = await getTranslations('ws-user-feedbacks');

  return (
    <section className="mb-6 space-y-4 rounded-[28px] border border-border/60 bg-linear-to-r from-background via-background to-muted/20 p-4 shadow-sm">
      <div className="space-y-1">
        <h2 className="font-semibold text-lg">
          {tUsers('feedback_support_title')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {tUsers('feedback_support_overview')}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">
                {tFeedback('requires_attention')}
              </div>
              <div className="text-muted-foreground text-sm">
                {tUsers('feedback_queue_description', {
                  count: attentionCount,
                })}
              </div>
            </div>
            <ShieldAlert className="h-5 w-5 text-dynamic-orange" />
          </div>

          <Button asChild variant="outline" size="sm">
            <Link href={`/${wsId}/users/database?requireAttention=true`}>
              {tUsers('feedback_queue_review')}
            </Link>
          </Button>
        </div>

        <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">{tFeedback('title')}</div>
              <div className="text-muted-foreground text-sm">
                {tUsers('feedback_records_description', {
                  count: feedbackCount,
                })}
              </div>
            </div>
            <MessageSquarePlus className="h-5 w-5 text-dynamic-blue" />
          </div>

          <Button asChild variant="outline" size="sm">
            <Link href={`/${wsId}/users/feedbacks`}>
              {tUsers('feedback_center_open')}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

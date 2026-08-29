'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2, RefreshCw } from '@tuturuuu/icons';
import {
  generateTutoringMessagePreview,
  type TutoringSessionRecord,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { getDisplayName } from './tutoring-types';

/**
 * Surfaces the `message-preview` endpoint that has existed since tutoring
 * shipped but was never reachable from the UI: it renders the parent-facing
 * note for a session and stores it back on the row.
 *
 * Keyed by session id on purpose. Reopening the dialog for another learner
 * while a preview is still in flight must not let the earlier response land in
 * the new dialog — React Query drops results for a superseded key, which a
 * mutation would not.
 */
export function TutoringParentMessageDialog({
  onOpenChange,
  session,
  wsId,
}: {
  onOpenChange: (open: boolean) => void;
  session: TutoringSessionRecord | null;
  wsId: string;
}) {
  const t = useTranslations('ws-tutoring');
  const queryClient = useQueryClient();
  const sessionId = session?.id ?? null;

  const previewQuery = useQuery({
    enabled: Boolean(sessionId),
    gcTime: 0,
    queryFn: () => generateTutoringMessagePreview(wsId, sessionId as string),
    queryKey: ['tutoring-parent-message', wsId, sessionId],
    retry: false,
    staleTime: 0,
  });

  const copyMutation = useMutation({
    mutationFn: (preview: string) => navigator.clipboard.writeText(preview),
    onSuccess: () => toast.success(t('parent_message_copied')),
    onError: () => toast.error(t('parent_message_copy_failed')),
  });

  const preview = previewQuery.data?.preview ?? null;

  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(session)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('parent_message')}</DialogTitle>
          <DialogDescription>
            {session
              ? t('parent_message_description', {
                  student: getDisplayName(session.student),
                })
              : null}
          </DialogDescription>
        </DialogHeader>

        {previewQuery.isPending || previewQuery.isFetching ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : preview ? (
          <p className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm">
            {preview}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t('parent_message_failed')}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            disabled={!sessionId || previewQuery.isFetching}
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ['tutoring-parent-message', wsId, sessionId],
              })
            }
            variant="outline"
          >
            {previewQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t('regenerate')}
          </Button>
          <Button
            disabled={!preview || copyMutation.isPending}
            onClick={() => preview && copyMutation.mutate(preview)}
          >
            <Copy className="h-4 w-4" />
            {t('copy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

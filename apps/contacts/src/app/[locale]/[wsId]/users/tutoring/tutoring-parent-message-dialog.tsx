'use client';

import { useMutation } from '@tanstack/react-query';
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
import { useEffect, useState } from 'react';
import { getDisplayName } from './tutoring-types';

/**
 * Surfaces the `message-preview` endpoint that has existed since tutoring
 * shipped but was never reachable from the UI: it renders the parent-facing
 * note for a session and stores it back on the row.
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
  const [preview, setPreview] = useState<string | null>(null);

  const previewMutation = useMutation({
    mutationFn: (sessionId: string) =>
      generateTutoringMessagePreview(wsId, sessionId),
    onSuccess: (result) => setPreview(result.preview),
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t('parent_message_failed')
      );
    },
  });

  const sessionId = session?.id ?? null;
  const { mutate } = previewMutation;

  useEffect(() => {
    if (!sessionId) {
      setPreview(null);
      return;
    }

    setPreview(null);
    mutate(sessionId);
  }, [mutate, sessionId]);

  const copy = async () => {
    if (!preview) return;

    try {
      await navigator.clipboard.writeText(preview);
      toast.success(t('parent_message_copied'));
    } catch {
      toast.error(t('parent_message_copy_failed'));
    }
  };

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

        {previewMutation.isPending || (!preview && !previewMutation.isError) ? (
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
            disabled={!sessionId || previewMutation.isPending}
            onClick={() => sessionId && previewMutation.mutate(sessionId)}
            variant="outline"
          >
            {previewMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t('regenerate')}
          </Button>
          <Button disabled={!preview} onClick={() => void copy()}>
            <Copy className="h-4 w-4" />
            {t('copy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

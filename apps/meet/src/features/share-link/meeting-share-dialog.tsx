'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, QrCode } from '@tuturuuu/icons';
import { createWorkspaceMeetingShortLink } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { MeetingQrDialog } from './meeting-qr-dialog';
import {
  displayLink,
  generatedLink,
  meetingShortLinksKey,
  shortLinkErrorKey,
  useMeetingShortLinks,
} from './use-meeting-short-links';
import { VanityLinks } from './vanity-links';

export function MeetingShareDialog({
  wsId,
  meetingId,
  fallbackUrl,
  open,
  onOpenChange,
}: {
  wsId: string;
  meetingId: string;
  /** Canonical tuturuuu.com/meet link shown until short links load. */
  fallbackUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('meet.share');
  const queryClient = useQueryClient();
  const [qrOpen, setQrOpen] = useState(false);
  const query = useMeetingShortLinks(wsId, meetingId, open);
  const state = query.data;
  const generated = generatedLink(state);
  const url = generated?.url ?? state?.canonicalUrl ?? fallbackUrl;

  const togglePrefix = useMutation({
    mutationFn: (prefixed: boolean) =>
      createWorkspaceMeetingShortLink(wsId, meetingId, {
        kind: 'generated',
        prefixed,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: meetingShortLinksKey(wsId, meetingId),
      }),
    onError: (error) => toast.error(t(`errors.${shortLinkErrorKey(error)}`)),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copy_failed'));
    }
  };

  return (
    <>
      {/* One modal at a time: the QR view replaces the share dialog. */}
      <Dialog open={open && !qrOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="meeting-share-link">{t('link')}</Label>
            <div className="flex gap-2">
              <Input
                id="meeting-share-link"
                value={displayLink(url)}
                readOnly
                aria-busy={query.isPending && open}
                className="flex-1 font-mono"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button onClick={() => void copy()} aria-label={t('copy')}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => setQrOpen(true)}
                aria-label={t('show_qr')}
              >
                <QrCode className="h-4 w-4" />
              </Button>
            </div>
            {generated ? (
              <p className="text-muted-foreground text-sm">
                {t('expires', {
                  date: new Date(generated.expiresAt).toLocaleDateString(),
                })}
                {' · '}
                {t('clicks', { count: generated.clicks })}
              </p>
            ) : null}
          </div>
          {state?.staff && generated ? (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="meeting-share-prefix">{t('meet_prefix')}</Label>
              <Switch
                id="meeting-share-prefix"
                checked={generated.prefixed}
                disabled={togglePrefix.isPending}
                onCheckedChange={(checked) => togglePrefix.mutate(checked)}
              />
            </div>
          ) : null}
          {state?.staff && state.eligible ? (
            <VanityLinks wsId={wsId} meetingId={meetingId} state={state} />
          ) : null}
        </DialogContent>
      </Dialog>
      <MeetingQrDialog url={url} open={qrOpen} onOpenChange={setQrOpen} />
    </>
  );
}

'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { MoreHorizontal } from '@tuturuuu/icons';
import {
  getMailMessageSource,
  getMailSourceHeaders,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { LoadingRegion, Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function MailMessageSourceMenu({
  workspaceId,
  mailboxId,
  messageId,
}: {
  workspaceId: string;
  mailboxId: string;
  messageId: string;
}) {
  const t = useTranslations('mail');
  const [open, setOpen] = useState(false);
  const copy = useMutation({
    mutationFn: async (headersOnly: boolean) => {
      const raw = await getMailMessageSource(workspaceId, mailboxId, messageId);
      await navigator.clipboard.writeText(
        headersOnly ? getMailSourceHeaders(raw) : raw
      );
    },
    onSuccess: () => toast.success(t('source_copied')),
    onError: () => toast.error(t('source_copy_failed')),
  });
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('message_more')}
            disabled={copy.isPending}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            {t('view_source')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => copy.mutate(false)}>
            {t('copy_raw_message')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => copy.mutate(true)}>
            {t('copy_headers')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t('view_source')}</DialogTitle>
          </DialogHeader>
          {open ? (
            <MessageSource
              workspaceId={workspaceId}
              mailboxId={mailboxId}
              messageId={messageId}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MessageSource({
  workspaceId,
  mailboxId,
  messageId,
}: {
  workspaceId: string;
  mailboxId: string;
  messageId: string;
}) {
  const t = useTranslations('mail');
  const source = useQuery({
    queryKey: ['mail', 'raw-source', workspaceId, mailboxId, messageId],
    queryFn: ({ signal }) =>
      getMailMessageSource(workspaceId, mailboxId, messageId, signal),
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  return (
    <>
      {source.isPending ? (
        <LoadingRegion srLabel={t('source_loading')}>
          <Skeleton className="h-96 w-full" />
        </LoadingRegion>
      ) : source.isError ? (
        <div role="alert" className="space-y-3">
          <p>{t('source_unavailable')}</p>
          <Button variant="outline" onClick={() => source.refetch()}>
            {t('retry')}
          </Button>
        </div>
      ) : (
        <Textarea
          readOnly
          aria-label={t('view_source')}
          value={source.data}
          className="h-96 resize-none font-mono text-xs"
        />
      )}
    </>
  );
}

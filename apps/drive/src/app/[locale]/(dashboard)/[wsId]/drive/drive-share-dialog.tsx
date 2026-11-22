'use client';

import { useMutation } from '@tanstack/react-query';
import { Check, Copy, Link } from '@tuturuuu/icons';
import {
  createWorkspaceStorageShareLink,
  type WorkspaceStorageShareLink,
} from '@tuturuuu/internal-api';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { getDriveObjectPath } from './drive-download';
import { DriveItemIcon } from './drive-item-icon';
import { DriveLinkNotice } from './drive-link-notice';
import { getStorageObjectDisplayName } from './storage-display-name';

/** Whole minutes or hours for the effective link lifetime. */
export function splitLinkLifetime(seconds: number) {
  if (seconds < 60 * 60) {
    return {
      unit: 'minutes',
      count: Math.max(1, Math.round(seconds / 60)),
    } as const;
  }
  return { unit: 'hours', count: Math.round(seconds / 3600) } as const;
}

/**
 * Writes a link that is still being created. Safari only allows clipboard
 * writes inside the click, so the pending text goes in a ClipboardItem.
 */
async function copyPendingLink(link: Promise<WorkspaceStorageShareLink>) {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': link.then(
          ({ url }) => new Blob([url], { type: 'text/plain' })
        ),
      }),
    ]);
    return link;
  }
  const resolved = await link;
  await navigator.clipboard.writeText(resolved.url);
  return resolved;
}

/**
 * File sharing in Drive is a short-lived download link whose lifetime the
 * server decides. Links cannot be revoked, so the dialog offers no long-lived
 * option.
 */
export function DriveShareDialog({
  file,
  onOpenChange,
  path,
  wsId,
}: {
  file: StorageObject;
  onOpenChange: (open: boolean) => void;
  path: string;
  wsId: string;
}) {
  const t = useTranslations('drive');
  const linkId = useId();
  const [copied, setCopied] = useState(false);
  const name = getStorageObjectDisplayName(file);
  const link = useMutation({
    mutationFn: (pending: Promise<WorkspaceStorageShareLink>) => pending,
    onSuccess: () => {
      setCopied(true);
      toast.success(t('share.copied'));
    },
    onError: () => toast.error(t('share.failed')),
  });
  // The clipboard write has to start inside the click, before any await.
  const copyLink = () => {
    const pending = copyPendingLink(
      createWorkspaceStorageShareLink(
        wsId,
        getDriveObjectPath(path, file),
        undefined,
        { fetch }
      )
    );
    // The mutation reports the failure; this only marks it as handled early.
    pending.catch(() => {});
    link.mutate(pending);
  };
  const lifetime = link.data?.expiresIn
    ? splitLinkLifetime(link.data.expiresIn)
    : null;

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="flex-row items-center gap-3 text-left">
          <DriveItemIcon item={file} />
          <div className="min-w-0 space-y-1">
            <DialogTitle className="truncate">
              {t('share.title', { name })}
            </DialogTitle>
            <DialogDescription>{t('share.description')}</DialogDescription>
          </div>
        </DialogHeader>
        <DriveLinkNotice />
        {link.data ? (
          <div className="space-y-2">
            <Label htmlFor={linkId}>{t('share.link')}</Label>
            <Input
              className="font-mono text-xs"
              id={linkId}
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              value={link.data.url}
            />
            <p aria-live="polite" className="text-muted-foreground text-sm">
              {lifetime
                ? t(`share.works_for_${lifetime.unit}`, {
                    count: lifetime.count,
                  })
                : t('share.works_short')}
            </p>
          </div>
        ) : null}
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t('common.done')}
          </Button>
          <Button disabled={link.isPending} onClick={copyLink} type="button">
            {copied ? (
              <Check className="size-4" />
            ) : link.data ? (
              <Copy className="size-4" />
            ) : (
              <Link className="size-4" />
            )}
            {link.isPending
              ? t('share.creating')
              : link.data
                ? t('share.copy_new')
                : t('share.copy_download_link')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

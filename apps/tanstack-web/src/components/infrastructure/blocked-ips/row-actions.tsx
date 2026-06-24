'use client';

import { Ellipsis, Eye, ShieldOff } from '@tuturuuu/icons';
import type {
  BlockedIpEntry,
  UnblockBlockedIpPayload,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export type BlockedIpRowActionHandlers = {
  isUnblocking?: boolean;
  onUnblock: (values: UnblockBlockedIpPayload) => Promise<void> | void;
};

type BlockedIpRowActionsProps = BlockedIpRowActionHandlers & {
  row: BlockedIpEntry;
};

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function displayIpAddress(ipAddress: string) {
  return ipAddress === '::1' ? 'localhost' : ipAddress;
}

export function BlockedIpRowActions({
  isUnblocking,
  onUnblock,
  row,
}: BlockedIpRowActionsProps) {
  const t = useTranslations();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [unblockOpen, setUnblockOpen] = useState(false);
  const [unblockReason, setUnblockReason] = useState('');
  const isActive = row.status === 'active';
  const displayIp = displayIpAddress(row.ip_address);

  async function handleUnblock() {
    await onUnblock({
      ipAddress: row.ip_address,
      reason: unblockReason.trim() || undefined,
    });
    setUnblockOpen(false);
    setUnblockReason('');
  }

  return (
    <>
      <Dialog open={unblockOpen} onOpenChange={setUnblockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('blocked-ips.unblock-ip')}</DialogTitle>
            <DialogDescription>
              {t('blocked-ips.unblock-ip-description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Label className="font-medium">
                {t('blocked-ips.ip_address')}:
              </Label>
              <span className="font-mono">{displayIp}</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`unblock-reason-${row.id}`}>
                {t('blocked-ips.unblock-reason')}
              </Label>
              <Input
                id={`unblock-reason-${row.id}`}
                onChange={(event) => setUnblockReason(event.target.value)}
                placeholder={t('blocked-ips.unblock-reason-placeholder')}
                value={unblockReason}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={isUnblocking}
              onClick={() => setUnblockOpen(false)}
              variant="outline"
            >
              {t('blocked-ips.cancel')}
            </Button>
            <Button disabled={isUnblocking} onClick={handleUnblock}>
              {isUnblocking
                ? t('blocked-ips.processing')
                : t('blocked-ips.unblock')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('blocked-ips.block-details')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-muted-foreground">
                  {t('blocked-ips.ip_address')}
                </Label>
                <p className="font-mono">{displayIp}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">
                  {t('blocked-ips.status')}
                </Label>
                <p className="capitalize">{row.status.replace('_', ' ')}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">
                  {t('blocked-ips.block_level')}
                </Label>
                <p>Level {row.block_level}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">
                  {t('blocked-ips.reason')}
                </Label>
                <p className="capitalize">{row.reason.replace(/_/gu, ' ')}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">
                  {t('blocked-ips.blocked_at')}
                </Label>
                <p>{formatDateTime(row.blocked_at)}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">
                  {t('blocked-ips.expires_at')}
                </Label>
                <p>{formatDateTime(row.expires_at)}</p>
              </div>
              {row.unblocked_at ? (
                <>
                  <div>
                    <Label className="text-muted-foreground">
                      {t('blocked-ips.unblocked_at')}
                    </Label>
                    <p>{formatDateTime(row.unblocked_at)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">
                      {t('blocked-ips.unblocked_by')}
                    </Label>
                    <p>{row.unblocked_by_user?.display_name || '-'}</p>
                  </div>
                </>
              ) : null}
              {row.unblock_reason ? (
                <div className="col-span-2">
                  <Label className="text-muted-foreground">
                    {t('blocked-ips.unblock_reason')}
                  </Label>
                  <p>{row.unblock_reason}</p>
                </div>
              ) : null}
              {row.metadata && Object.keys(row.metadata).length > 0 ? (
                <div className="col-span-2">
                  <Label className="text-muted-foreground">
                    {t('blocked-ips.metadata')}
                  </Label>
                  <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(row.metadata, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
            variant="ghost"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">{t('blocked-ips.actions')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => setDetailsOpen(true)}>
            <Eye className="mr-2 h-4 w-4" />
            {t('blocked-ips.view-details')}
          </DropdownMenuItem>

          {isActive ? (
            <DropdownMenuItem onClick={() => setUnblockOpen(true)}>
              <ShieldOff className="mr-2 h-4 w-4" />
              {t('blocked-ips.unblock')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

'use client';

import type { Row } from '@tanstack/react-table';
import { Ellipsis, ShieldOff, Eye } from '@tuturuuu/icons';
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
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BlockedIPEntry } from './columns';

interface BlockedIPRowActionsProps {
  row: Row<BlockedIPEntry>;
}

export function BlockedIPRowActions({ row }: BlockedIPRowActionsProps) {
  const t = useTranslations();
  const router = useRouter();

  const entry = row.original;
  const [unblockOpen, setUnblockOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isUnblocking, setIsUnblocking] = useState(false);
  const [unblockReason, setUnblockReason] = useState('');

  const isActive = entry.status === 'active';
  const displayIp = entry.ip_address === '::1' ? 'localhost' : entry.ip_address;

  const handleUnblock = async () => {
    if (isUnblocking) return;

    setIsUnblocking(true);
    try {
      const res = await fetch('/api/v1/infrastructure/blocked-ips', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip_address: entry.ip_address,
          reason: unblockReason || undefined,
        }),
      });

      if (res.ok) {
        toast.success(t('blocked-ips.ip-unblocked'), {
          description: `${displayIp} ${t('blocked-ips.has-been-unblocked')}`,
        });
        setUnblockOpen(false);
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(t('blocked-ips.unblock-failed'), {
          description: data.message || t('blocked-ips.unblock-error'),
        });
      }
    } catch (_error) {
      toast.error(t('blocked-ips.unblock-failed'), {
        description: t('blocked-ips.network-error'),
      });
    } finally {
      setIsUnblocking(false);
    }
  };

  return (
    <>
      {/* Unblock Dialog */}
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
              <Label htmlFor="unblock-reason">
                {t('blocked-ips.unblock-reason')}
              </Label>
              <Input
                id="unblock-reason"
                placeholder={t('blocked-ips.unblock-reason-placeholder')}
                value={unblockReason}
                onChange={(e) => setUnblockReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUnblockOpen(false)}>
              {t('blocked-ips.cancel')}
            </Button>
            <Button onClick={handleUnblock} disabled={isUnblocking}>
              {isUnblocking
                ? t('blocked-ips.processing')
                : t('blocked-ips.unblock')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
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
                <p className="capitalize">{entry.status.replace('_', ' ')}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">
                  {t('blocked-ips.block_level')}
                </Label>
                <p>Level {entry.block_level}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">
                  {t('blocked-ips.reason')}
                </Label>
                <p className="capitalize">{entry.reason.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">
                  {t('blocked-ips.blocked_at')}
                </Label>
                <p>{new Date(entry.blocked_at).toLocaleString()}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">
                  {t('blocked-ips.expires_at')}
                </Label>
                <p>{new Date(entry.expires_at).toLocaleString()}</p>
              </div>
              {entry.unblocked_at && (
                <>
                  <div>
                    <Label className="text-muted-foreground">
                      {t('blocked-ips.unblocked_at')}
                    </Label>
                    <p>{new Date(entry.unblocked_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">
                      {t('blocked-ips.unblocked_by')}
                    </Label>
                    <p>{entry.unblocked_by_user?.display_name || '-'}</p>
                  </div>
                </>
              )}
              {entry.unblock_reason && (
                <div className="col-span-2">
                  <Label className="text-muted-foreground">
                    {t('blocked-ips.unblock_reason')}
                  </Label>
                  <p>{entry.unblock_reason}</p>
                </div>
              )}
              {Object.keys(entry.metadata || {}).length > 0 && (
                <div className="col-span-2">
                  <Label className="text-muted-foreground">
                    {t('blocked-ips.metadata')}
                  </Label>
                  <pre className="mt-1 rounded bg-muted p-2 text-xs">
                    {JSON.stringify(entry.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
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

          {isActive && (
            <DropdownMenuItem onClick={() => setUnblockOpen(true)}>
              <ShieldOff className="mr-2 h-4 w-4" />
              {t('blocked-ips.unblock')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

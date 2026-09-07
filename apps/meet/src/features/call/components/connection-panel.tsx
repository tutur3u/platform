'use client';

import { Activity, Copy, RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { MediaDiagnostics } from '../lib/media-diagnostics';

export function ConnectionPanel({
  read,
  reconnect,
}: {
  read: () => Promise<MediaDiagnostics>;
  reconnect: () => void;
}) {
  const t = useTranslations('meet.call');
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<MediaDiagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const refresh = async () => {
    const id = ++requestId.current;
    setBusy(true);
    try {
      const next = await read();
      if (id === requestId.current) setSnapshot(next);
    } catch {
      if (id === requestId.current) setSnapshot(null);
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };
  const status = (state: string) =>
    state === 'connected'
      ? t('connection_connected')
      : state === 'not_started'
        ? t('connection_not_started')
        : state === 'new' || state === 'connecting'
          ? t('connection_connecting')
          : t('connection_disconnected');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void refresh();
        else {
          requestId.current++;
          setSnapshot(null);
          setBusy(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Activity className="size-4" />
          {t('connection_title')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('connection_title')}</DialogTitle>
          <DialogDescription>{t('connection_hint')}</DialogDescription>
        </DialogHeader>
        <div aria-live="polite" className="space-y-3">
          {snapshot ? (
            (
              [
                ['publisher', t('connection_sending')],
                ['subscriber', t('connection_receiving')],
              ] as const
            ).map(([direction, label]) => (
              <div key={direction} className="rounded-lg border p-3">
                <div className="flex justify-between gap-3 text-sm">
                  <span>{label}</span>
                  <strong>{status(snapshot[direction].state)}</strong>
                </div>
                <p className="mt-1 text-muted-foreground text-xs">
                  {snapshot[direction].statsUnavailable
                    ? t('connection_stats_unavailable')
                    : t('connection_packets', {
                        count: snapshot[direction].streams.reduce(
                          (sum, stream) => sum + stream.packets,
                          0
                        ),
                      })}
                </p>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              {busy
                ? t('connection_checking')
                : t('connection_stats_unavailable')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            size="sm"
            variant="outline"
            onClick={() => void refresh()}
          >
            <RefreshCw className="size-4" />
            {t('connection_refresh')}
          </Button>
          <Button
            disabled={!snapshot || busy}
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  JSON.stringify(snapshot, null, 2)
                );
                toast.success(t('connection_copied'));
              } catch {
                toast.error(t('connection_copy_failed'));
              }
            }}
          >
            <Copy className="size-4" />
            {t('connection_copy')}
          </Button>
        </div>
        <Button
          onClick={() => {
            requestId.current++;
            reconnect();
            setSnapshot(null);
            setOpen(false);
            toast.info(t('connection_reconnecting'));
          }}
        >
          {t('connection_reconnect')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

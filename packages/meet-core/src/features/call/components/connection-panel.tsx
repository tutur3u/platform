'use client';

import { ArrowDown, ArrowUp, Copy, RefreshCw } from '@tuturuuu/icons';
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
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { MediaDiagnostics } from '../lib/media-diagnostics';
import { ConnectionOverview } from './connection-overview';

export function ConnectionPanel({
  read,
  reconnect,
  telemetry,
  embedded = false,
}: {
  embedded?: boolean;
  read: () => Promise<MediaDiagnostics>;
  telemetry?: MediaDiagnostics;
  reconnect: () => void;
}) {
  const t = useTranslations('meet.call');
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<MediaDiagnostics | null>(null);
  const latestTelemetry = useRef(telemetry);
  latestTelemetry.current = telemetry;
  const snapshotTelemetry = useRef(telemetry);
  const data =
    snapshot && snapshotTelemetry.current === telemetry
      ? snapshot
      : (telemetry ?? snapshot);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const refresh = async () => {
    const id = ++requestId.current;
    setBusy(true);
    try {
      const next = await read();
      if (id === requestId.current) {
        snapshotTelemetry.current = latestTelemetry.current;
        setSnapshot(next);
      }
    } catch {
      if (id === requestId.current) setSnapshot(null);
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };

  const content = (
    <>
      <ConnectionOverview data={data} />
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
          disabled={!data || busy}
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                JSON.stringify(data, null, 2)
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
          setBusy(false);
          reconnect();
          setSnapshot(null);
          setOpen(false);
          toast.info(t('connection_reconnecting'));
        }}
      >
        {t('connection_reconnect')}
      </Button>
    </>
  );
  if (embedded) return content;
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
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 rounded-full px-2.5 tabular-nums"
          aria-label={t('connection_title')}
          title={t('connection_title')}
        >
          <ArrowUp
            aria-hidden
            className={cn(
              'size-3.5',
              telemetry?.publisher.state === 'connected'
                ? 'text-dynamic-green'
                : 'text-muted-foreground'
            )}
          />
          <ArrowDown
            aria-hidden
            className={cn(
              'size-3.5',
              telemetry?.subscriber.state === 'connected'
                ? 'text-dynamic-green'
                : 'text-muted-foreground'
            )}
          />
          <span className="text-xs">
            {telemetry?.publisher.roundTripMs ??
              telemetry?.subscriber.roundTripMs ??
              '—'}{' '}
            ms
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('connection_title')}</DialogTitle>
          <DialogDescription>{t('connection_hint')}</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

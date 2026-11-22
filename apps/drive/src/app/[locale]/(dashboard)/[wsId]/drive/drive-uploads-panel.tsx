'use client';

import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  RotateCw,
  X,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Progress } from '@tuturuuu/ui/progress';
import { cn, formatBytes } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DriveItemIcon } from './drive-item-icon';
import type { DriveUploadItem } from './drive-upload-queue';
import type { DriveUploads } from './use-drive-uploads';

function UploadRow({
  item,
  uploads,
}: {
  item: DriveUploadItem;
  uploads: DriveUploads;
}) {
  const t = useTranslations('drive');
  const { status } = item;
  const percent =
    status.kind === 'uploading' && item.size > 0
      ? Math.round((status.loaded / item.size) * 100)
      : 0;

  const detail = (() => {
    switch (status.kind) {
      case 'queued':
        return t('uploads.waiting');
      case 'uploading':
        return t('uploads.percent', { percent });
      case 'finalizing':
        return t('uploads.processing');
      case 'done':
        return t('uploads.done', { size: formatBytes(item.size) });
      case 'failed':
        return t(`uploads.failed.${status.reason}`);
      case 'canceled':
        return t('uploads.canceled');
      default: {
        const exhaustive: never = status;
        return exhaustive;
      }
    }
  })();
  const active =
    status.kind === 'queued' ||
    status.kind === 'uploading' ||
    status.kind === 'finalizing';

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <DriveItemIcon
        className="size-8 rounded-lg"
        iconClassName="size-4"
        item={{ id: item.id, name: item.name }}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline gap-2">
          <strong className="min-w-0 flex-1 truncate text-sm">
            {item.name}
          </strong>
          {status.kind === 'done' ? (
            <CircleCheck aria-hidden className="size-4 text-dynamic-green" />
          ) : status.kind === 'failed' ? (
            <CircleAlert aria-hidden className="size-4 text-destructive" />
          ) : null}
        </span>
        {status.kind === 'uploading' ? (
          <Progress aria-label={item.name} className="h-1.5" value={percent} />
        ) : null}
        <span
          className={cn(
            'text-xs',
            status.kind === 'failed'
              ? 'text-destructive'
              : 'text-muted-foreground'
          )}
        >
          {detail}
        </span>
      </span>
      {active ? (
        <Button
          aria-label={t('uploads.cancel_named', { name: item.name })}
          onClick={() => uploads.cancel(item.id)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      ) : status.kind === 'failed' || status.kind === 'canceled' ? (
        <Button
          aria-label={t('uploads.retry_named', { name: item.name })}
          onClick={() => uploads.retry(item.id)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <RotateCw className="size-4" />
        </Button>
      ) : null}
    </li>
  );
}

export function DriveUploadsPanel({ uploads }: { uploads: DriveUploads }) {
  const t = useTranslations('drive');
  const [collapsed, setCollapsed] = useState(false);
  const { items, summary } = uploads;
  if (items.length === 0) return null;

  const title =
    summary.activeCount > 0
      ? t('uploads.title_active', {
          count: summary.activeCount,
          percent: summary.percent,
        })
      : summary.failedCount > 0
        ? t('uploads.title_failed', { count: summary.failedCount })
        : t('uploads.title_done', { count: summary.doneCount });

  return (
    <section
      aria-label={t('uploads.label')}
      className="fixed inset-x-4 bottom-[calc(var(--sorbet-content-bottom-clearance,0px)+1rem)] z-30 overflow-hidden rounded-2xl border border-border bg-card shadow-elevation-3 md:inset-x-auto md:right-6 md:bottom-6 md:w-96"
    >
      <header className="flex items-center gap-1 border-border border-b py-2 pr-2 pl-4">
        <strong aria-live="polite" className="min-w-0 flex-1 truncate text-sm">
          {title}
        </strong>
        <Button
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('uploads.expand') : t('uploads.collapse')}
          onClick={() => setCollapsed((value) => !value)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronDown
            className={cn(
              'size-4 transition-transform',
              collapsed && 'rotate-180'
            )}
          />
        </Button>
        <Button
          aria-label={
            summary.activeCount > 0
              ? t('uploads.cancel_all')
              : t('uploads.close')
          }
          onClick={
            summary.activeCount > 0 ? uploads.cancelAll : uploads.clearFinished
          }
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </header>
      {collapsed ? null : (
        <ul className="max-h-72 divide-y divide-border overflow-y-auto">
          {items.map((item) => (
            <UploadRow item={item} key={item.id} uploads={uploads} />
          ))}
        </ul>
      )}
    </section>
  );
}

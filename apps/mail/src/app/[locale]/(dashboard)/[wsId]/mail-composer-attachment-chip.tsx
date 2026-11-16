import {
  AlertCircle,
  Clock,
  Loader2,
  Paperclip,
  RefreshCw,
  X,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import type { MailMediaItem } from './mail-composer-upload-state';

const ACTION_CLASS =
  "relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors after:absolute after:-inset-1 after:content-[''] hover:bg-foreground/10 hover:text-foreground pointer-coarse:size-8";

/** Indeterminate hairline: fetch reports no upload bytes, so no percentage. */
function Hairline() {
  const slider = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = slider.current;
    if (
      !node ||
      typeof node.animate !== 'function' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const animation = node.animate(
      [{ transform: 'translateX(-100%)' }, { transform: 'translateX(250%)' }],
      { duration: 1200, easing: 'ease-in-out', iterations: Infinity }
    );
    return () => animation.cancel();
  }, []);
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-foreground/15"
    >
      <i
        className="absolute inset-y-0 left-0 block w-[40%] bg-dynamic-blue"
        ref={slider}
      />
    </span>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MailComposerAttachmentChip({
  item,
  onRemove,
  onRetry,
}: {
  item: MailMediaItem;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const t = useTranslations('mail');
  const { status } = item;
  const failed = status === 'failed';
  const Glyph = failed
    ? AlertCircle
    : status === 'queued'
      ? Clock
      : status === 'uploading'
        ? Loader2
        : Paperclip;
  const label =
    status === 'uploaded' || status === 'removing'
      ? formatBytes(item.sizeBytes)
      : failed
        ? t('upload_failed')
        : status === 'queued'
          ? t('upload_waiting')
          : t('uploading');

  return (
    <li
      className={cn(
        'relative flex h-8 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-lg bg-foreground/[0.05] pr-1 pl-2 text-xs pointer-coarse:h-9',
        failed && 'bg-dynamic-red/10'
      )}
      data-status={status}
    >
      <Glyph
        aria-hidden="true"
        className={cn(
          'size-3 shrink-0',
          failed ? 'text-dynamic-red' : 'text-muted-foreground',
          status === 'uploading' && 'animate-spin motion-reduce:animate-none'
        )}
      />
      <span className="max-w-44 truncate" title={item.name}>
        {item.name}
      </span>
      <span
        className={cn(
          'whitespace-nowrap text-[0.68rem]',
          failed
            ? 'font-semibold text-dynamic-red'
            : status === 'uploaded'
              ? 'text-muted-foreground'
              : 'text-foreground'
        )}
      >
        {label}
      </span>
      {failed ? (
        <button
          aria-label={t('media_action_named', {
            action: t('retry'),
            name: item.name,
          })}
          className={ACTION_CLASS}
          data-chip-retry={item.id}
          onClick={() => onRetry(item.id)}
          type="button"
        >
          <RefreshCw className="size-3.5" />
        </button>
      ) : null}
      <button
        aria-label={t('media_action_named', {
          action: t('remove_attachment'),
          name: item.name,
        })}
        className={ACTION_CLASS}
        data-chip-remove={item.id}
        onClick={() => onRemove(item.id)}
        type="button"
      >
        <X className="size-3.5" />
      </button>
      {status === 'uploading' ? <Hairline /> : null}
    </li>
  );
}

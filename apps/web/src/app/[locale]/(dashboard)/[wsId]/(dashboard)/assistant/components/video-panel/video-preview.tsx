'use client';

import { Camera, Maximize2, Monitor, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useRef } from 'react';

export type VideoPreviewProps = {
  compact?: boolean;
  stream: MediaStream | null;
  type: 'webcam' | 'screen' | null;
  onClose?: () => void;
};

function StreamVideo({
  stream,
  mirrored,
  className,
}: {
  stream: MediaStream;
  mirrored: boolean;
  className: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    return () => {
      video.srcObject = null;
    };
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={className}
      style={{ transform: mirrored ? 'scaleX(-1)' : undefined }}
    />
  );
}

function VideoPreview({
  compact = false,
  stream,
  type,
  onClose,
}: VideoPreviewProps) {
  const t = useTranslations('dashboard.voice_assistant');
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const track = stream?.getVideoTracks()[0];
    const ended = () => onCloseRef.current?.();
    track?.addEventListener('ended', ended);
    return () => track?.removeEventListener('ended', ended);
  }, [stream]);
  if (!stream) return null;
  const Icon = type === 'webcam' ? Camera : Monitor;
  const label = t(type === 'webcam' ? 'camera_active' : 'screen_active');
  const stopLabel = t(type === 'webcam' ? 'disable_camera' : 'stop_sharing');
  return (
    <section
      aria-label={label}
      className={cn(
        'motion-safe:fade-in motion-safe:slide-in-from-top-1 overflow-hidden rounded-xl border border-border/60 bg-background motion-safe:animate-in motion-safe:duration-200',
        compact ? 'mt-2' : 'mx-4 my-3'
      )}
    >
      <div className="flex min-w-0 items-center gap-2 p-2">
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label={t('expand_preview')}
              className="group relative h-10 w-16 shrink-0 overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <StreamVideo
                stream={stream}
                mirrored={type === 'webcam'}
                className="size-full object-cover"
              />
              <span className="absolute inset-0 grid place-items-center bg-background/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
                <Maximize2 aria-hidden className="size-3.5" />
              </span>
            </button>
          </DialogTrigger>
          <DialogContent aria-describedby={undefined} className="sm:max-w-3xl">
            <DialogTitle className="flex items-center gap-2">
              <Icon aria-hidden className="size-4" />
              {label}
            </DialogTitle>
            <StreamVideo
              stream={stream}
              mirrored={type === 'webcam'}
              className="max-h-[65dvh] w-full rounded-lg bg-muted object-contain"
            />
          </DialogContent>
        </Dialog>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-medium text-xs">
            <Icon aria-hidden className="size-3.5 shrink-0 text-primary" />
            {label}
          </p>
          <p className="mt-0.5 truncate text-muted-foreground text-xs">
            {t('studio.sharing')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-lg"
          aria-label={stopLabel}
          title={stopLabel}
          onClick={onClose}
        >
          <X aria-hidden className="size-3.5" />
        </Button>
      </div>
      {!compact && (
        <StreamVideo
          stream={stream}
          mirrored={type === 'webcam'}
          className="max-h-40 w-full object-contain"
        />
      )}
    </section>
  );
}
export default memo(VideoPreview);

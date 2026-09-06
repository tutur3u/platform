'use client';

import { Camera, Monitor, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useRef } from 'react';

export type VideoPreviewProps = {
  stream: MediaStream | null;
  type: 'webcam' | 'screen' | null;
  onClose?: () => void;
};
function VideoPreview({ stream, type, onClose }: VideoPreviewProps) {
  const t = useTranslations('dashboard.voice_assistant');
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.srcObject = stream;
    const track = stream?.getVideoTracks()[0];
    const ended = () => onCloseRef.current?.();
    track?.addEventListener('ended', ended);
    return () => {
      track?.removeEventListener('ended', ended);
      if (video) video.srcObject = null;
    };
  }, [stream]);
  if (!stream) return null;
  return (
    <section
      className="mx-4 my-3 overflow-hidden rounded-xl border bg-muted/30"
      aria-label={type === 'webcam' ? t('enable_camera') : t('share_screen')}
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <p className="flex items-center gap-2 text-sm">
          {type === 'webcam' ? (
            <Camera className="size-4 text-primary" />
          ) : (
            <Monitor className="size-4 text-primary" />
          )}
          {t('studio.sharing')}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t('stop_sharing')}
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="max-h-40 w-full object-contain"
        style={{ transform: type === 'webcam' ? 'scaleX(-1)' : undefined }}
      />
    </section>
  );
}
export default memo(VideoPreview);

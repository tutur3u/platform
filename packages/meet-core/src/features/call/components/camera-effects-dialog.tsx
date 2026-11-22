'use client';
import { Ban, Contrast, Snowflake, Sun } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Slider } from '@tuturuuu/ui/slider';
import { useTranslations } from 'next-intl';
import { useCallback, useId } from 'react';
import type { CameraFilter, CameraLook } from '../lib/camera-effects';

export const CAMERA_FILTERS = [
  'none',
  'warm',
  'cool',
  'mono',
] as const satisfies readonly CameraFilter[];
const FILTER_ICONS = {
  none: Ban,
  warm: Sun,
  cool: Snowflake,
  mono: Contrast,
} as const;

function SelfPreview({ stream }: { stream: MediaStream | null }) {
  const t = useTranslations('meet.call');
  const attach = useCallback(
    (video: HTMLVideoElement | null) => {
      if (video && video.srcObject !== stream) video.srcObject = stream;
    },
    [stream]
  );
  const live = !!stream?.getVideoTracks().some((track) => track.enabled);
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-muted">
      {live ? (
        <video
          ref={attach}
          autoPlay
          muted
          playsInline
          className="size-full -scale-x-100 object-cover"
        />
      ) : (
        <p className="grid size-full place-items-center px-4 text-center text-muted-foreground text-sm">
          {t('camera_effects_preview_off')}
        </p>
      )}
    </div>
  );
}

/** Camera filter and softness, with a live preview of the processed camera. */
export function CameraEffectsDialog({
  open,
  onOpenChange,
  look,
  setLook,
  stream,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  look: CameraLook;
  setLook: (look: CameraLook) => Promise<void>;
  stream: MediaStream | null;
}) {
  const t = useTranslations('meet.call');
  const softnessId = useId();
  const update = (next: CameraLook) => {
    void setLook(next).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        toast.error(t('effects_failed'));
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('camera_effects')}</DialogTitle>
        </DialogHeader>
        {open && <SelfPreview stream={stream} />}
        <div
          role="radiogroup"
          aria-label={t('camera_effects')}
          className="grid grid-cols-2 gap-2"
        >
          {CAMERA_FILTERS.map((filter) => {
            const Icon = FILTER_ICONS[filter];
            const selected = look.filter === filter;
            return (
              <Button
                key={filter}
                type="button"
                role="radio"
                aria-checked={selected}
                variant={selected ? 'secondary' : 'outline'}
                className="h-11 justify-start gap-2 rounded-full px-4 aria-checked:border-foreground"
                onClick={() => update({ ...look, filter })}
              >
                <Icon className="size-4" />
                {t(`filter_${filter}`)}
              </Button>
            );
          })}
        </div>
        <div className="grid gap-3">
          <Label id={softnessId}>{t('soft_portrait')}</Label>
          <Slider
            aria-labelledby={softnessId}
            min={0}
            max={100}
            step={10}
            value={[Math.round(look.softness * 100)]}
            onValueChange={([value]) =>
              update({ ...look, softness: (value ?? 0) / 100 })
            }
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
          >
            {t('effects_done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

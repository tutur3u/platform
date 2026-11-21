'use client';

import { Maximize2, Minimize2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { displayLink } from './use-meeting-short-links';

/**
 * Large dark-on-light QR for scanning across a room. The code keeps the
 * library's black-on-white modules in both themes because scanners read
 * inverted codes unreliably.
 */
function QrSurface({ url, large }: { url: string; large: boolean }) {
  return (
    <>
      <QRCodeSVG
        value={url}
        size={512}
        level="M"
        marginSize={2}
        title={displayLink(url)}
        className={
          large
            ? 'aspect-square h-auto max-h-[80vh] w-full max-w-[80vh]'
            : 'aspect-square h-auto w-full max-w-sm'
        }
      />
      <p
        className={
          large
            ? 'break-all text-center font-semibold text-4xl'
            : 'break-all text-center font-semibold text-xl'
        }
      >
        {displayLink(url)}
      </p>
    </>
  );
}

/**
 * QR dialog with a present mode. Present closes the dialog and shows the code
 * in a viewport-filling layer on `document.body`, then asks for fullscreen;
 * where fullscreen is unavailable (iOS Safari, embedded views) the layer still
 * fills the screen.
 */
export function MeetingQrDialog({
  url,
  open,
  onOpenChange,
}: {
  url: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('meet.share');
  const layer = useRef<HTMLDivElement>(null);
  const [presenting, setPresenting] = useState(false);

  const present = () => {
    flushSync(() => setPresenting(true));
    layer.current?.requestFullscreen?.().catch(() => {});
  };
  const exit = () => {
    setPresenting(false);
    if (document.fullscreenElement === layer.current)
      document.exitFullscreen?.().catch(() => {});
  };

  return (
    <>
      <Dialog open={open && !presenting} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('qr_title')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 rounded-lg bg-white p-4 text-black">
            <QrSurface url={url} large={false} />
          </div>
          <Button size="lg" onClick={present}>
            <Maximize2 className="mr-2 h-5 w-5" />
            {t('present')}
          </Button>
        </DialogContent>
      </Dialog>
      {presenting
        ? createPortal(
            <div
              ref={layer}
              role="dialog"
              aria-modal="true"
              aria-label={t('qr_title')}
              className="pointer-events-auto fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6 text-black"
              onKeyDown={(event) => {
                if (event.key === 'Escape') exit();
              }}
            >
              <QrSurface url={url} large />
              <Button variant="outline" size="lg" autoFocus onClick={exit}>
                <Minimize2 className="mr-2 h-5 w-5" />
                {t('exit_present')}
              </Button>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

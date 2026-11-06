'use client';

import { QRCodeSVG } from 'qrcode.react';
import type { DownloadLabels } from './download-option';

export function MobileQr({
  url,
  labels,
}: {
  url: string;
  labels: DownloadLabels;
}) {
  return (
    <aside className="flex min-w-0 flex-col items-center justify-center rounded-3xl border border-border/70 bg-background/80 p-6 text-center shadow-sm">
      <div className="rounded-2xl border bg-white p-3">
        <QRCodeSVG
          value={url}
          size={144}
          title={labels.qrCodeLabel}
          role="img"
          aria-label={labels.qrCodeLabel}
        />
      </div>
      <h2 className="mt-4 font-medium">{labels.qrTitle}</h2>
      <p className="mt-1 max-w-56 text-muted-foreground text-xs">
        {labels.qrDescription}
      </p>
    </aside>
  );
}

'use client';

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';
import {
  DOWNLOAD_PLATFORMS,
  type DownloadPlatform,
  isMobilePlatform,
  refinePlatform,
  resolvePrimaryPlatform,
} from '@/lib/download-platform';
import type { DownloadLabels, DownloadOption } from './download-option';
import { OtherPlatforms } from './other-platforms';
import { PrimaryDownload } from './primary-download';

// Mobile visitors never see the QR code, so they never load its library.
const MobileQr = dynamic(
  () => import('./mobile-qr').then((mod) => mod.MobileQr),
  {
    loading: () => (
      <div className="h-64 rounded-3xl border border-border/70 bg-background/80" />
    ),
  }
);

const subscribe = () => () => {};

function readClientPlatform(detected: DownloadPlatform) {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  return refinePlatform(detected, {
    maxTouchPoints: nav.maxTouchPoints,
    uaPlatform: nav.userAgentData?.platform,
  });
}

// The server picks from the user agent; the client only corrects cases the
// user agent hides (iPadOS). Both render the same card shape, so a correction
// swaps content without moving the layout.
export function DownloadChooser({
  detected,
  options,
  labels,
  qrUrl,
}: {
  detected: DownloadPlatform;
  options: Record<DownloadPlatform, DownloadOption>;
  labels: DownloadLabels;
  qrUrl: string;
}) {
  const platform = useSyncExternalStore(
    subscribe,
    () => readClientPlatform(detected),
    () => detected
  );
  const available = DOWNLOAD_PLATFORMS.filter(
    (item) => options[item].action !== null
  );
  const primary = resolvePrimaryPlatform(platform, available);
  const showQr = !isMobilePlatform(platform);

  return (
    <>
      <div
        className={
          showQr
            ? 'mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]'
            : 'mt-10'
        }
      >
        <PrimaryDownload option={options[primary]} labels={labels} />
        {showQr && <MobileQr url={qrUrl} labels={labels} />}
      </div>
      <OtherPlatforms
        options={DOWNLOAD_PLATFORMS.filter((item) => item !== primary).map(
          (item) => options[item]
        )}
        labels={labels}
      />
    </>
  );
}

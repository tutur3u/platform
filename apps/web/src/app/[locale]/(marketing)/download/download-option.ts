import type { DownloadPlatform } from '@/lib/download-platform';

export type DownloadAction = {
  href: string;
  label: string;
  // Compact label for cards; `label` stays the accessible name.
  shortLabel?: string;
  external: boolean;
};

// Fully translated, serializable view model shared by the server builder and
// the client chooser.
export type DownloadOption = {
  platform: DownloadPlatform;
  name: string;
  title: string;
  // Set when the offered build is a beta (TestFlight, Play testing, desktop).
  beta: boolean;
  meta: string[];
  requirements: string;
  action: DownloadAction | null;
  // Beta channel opt-in, offered beside a public store listing.
  betaAction?: DownloadAction;
  note?: string;
  noteLink?: DownloadAction;
  releaseNotes?: DownloadAction;
  sha256?: string;
};

export type DownloadLabels = {
  recommended: string;
  others: string;
  beta: string;
  checksum: string;
  details: string;
  newTab: string;
  qrTitle: string;
  qrDescription: string;
  qrCodeLabel: string;
  unavailable: string;
};

import type { DownloadPlatform } from '@/lib/download-platform';

export type DownloadAction = {
  href: string;
  label: string;
  // Compact label for list rows; `label` stays the accessible name.
  shortLabel?: string;
  external: boolean;
};

// Fully translated, serializable view model shared by the server builder and
// the client chooser.
export type DownloadOption = {
  platform: DownloadPlatform;
  name: string;
  title: string;
  meta: string[];
  action: DownloadAction | null;
  note?: string;
  noteLink?: DownloadAction;
  releaseNotes?: DownloadAction;
  sha256?: string;
};

export type DownloadLabels = {
  recommended: string;
  others: string;
  checksum: string;
  details: string;
  newTab: string;
  qrTitle: string;
  qrDescription: string;
  qrCodeLabel: string;
  unavailable: string;
};

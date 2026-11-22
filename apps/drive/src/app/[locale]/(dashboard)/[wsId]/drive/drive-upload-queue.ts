import { InternalApiError } from '@tuturuuu/internal-api';

export type DriveUploadFailure =
  | 'too_large'
  | 'quota'
  | 'type'
  | 'denied'
  | 'network'
  | 'rejected'
  | 'unavailable'
  | 'unknown';

export type DriveUploadStatus =
  | { kind: 'queued' }
  | { kind: 'uploading'; loaded: number }
  | { kind: 'finalizing' }
  | { kind: 'done' }
  | { kind: 'failed'; reason: DriveUploadFailure }
  | { kind: 'canceled' };

export interface DriveUploadItem {
  id: string;
  name: string;
  /** Destination folder, relative to the workspace Drive root. */
  path: string;
  size: number;
  status: DriveUploadStatus;
}

export type DriveUploadEvent =
  | { type: 'enqueue'; items: Omit<DriveUploadItem, 'status'>[] }
  | { type: 'start'; id: string }
  | { type: 'progress'; id: string; loaded: number }
  | { type: 'finalize'; id: string }
  | { type: 'succeed'; id: string }
  | { type: 'fail'; id: string; reason: DriveUploadFailure }
  | { type: 'cancel'; id: string }
  | { type: 'retry'; id: string }
  | { type: 'clear-finished' };

const active = new Set<DriveUploadStatus['kind']>([
  'queued',
  'uploading',
  'finalizing',
]);

export function isDriveUploadActive(item: DriveUploadItem) {
  return active.has(item.status.kind);
}

function update(
  items: DriveUploadItem[],
  id: string,
  next: (item: DriveUploadItem) => DriveUploadStatus | null
) {
  let changed = false;
  const result = items.map((item) => {
    if (item.id !== id) return item;
    const status = next(item);
    if (!status) return item;
    changed = true;
    return { ...item, status };
  });
  return changed ? result : items;
}

/**
 * Admits each event only from the states it can follow, so a late progress
 * report cannot revive a canceled or finished upload.
 */
export function driveUploadReducer(
  items: DriveUploadItem[],
  event: DriveUploadEvent
): DriveUploadItem[] {
  switch (event.type) {
    case 'enqueue':
      return [
        ...items,
        ...event.items.map((item) => ({
          ...item,
          status: { kind: 'queued' } as const,
        })),
      ];
    case 'start':
      return update(items, event.id, ({ status }) =>
        status.kind === 'queued' ? { kind: 'uploading', loaded: 0 } : null
      );
    case 'progress':
      return update(items, event.id, ({ status, size }) =>
        status.kind === 'uploading'
          ? { kind: 'uploading', loaded: Math.min(size, event.loaded) }
          : null
      );
    case 'finalize':
      return update(items, event.id, ({ status }) =>
        status.kind === 'uploading' ? { kind: 'finalizing' } : null
      );
    case 'succeed':
      return update(items, event.id, ({ status }) =>
        status.kind === 'uploading' || status.kind === 'finalizing'
          ? { kind: 'done' }
          : null
      );
    case 'fail':
      return update(items, event.id, (item) =>
        isDriveUploadActive(item)
          ? { kind: 'failed', reason: event.reason }
          : null
      );
    case 'cancel':
      return update(items, event.id, (item) =>
        isDriveUploadActive(item) ? { kind: 'canceled' } : null
      );
    case 'retry':
      return update(items, event.id, ({ status }) =>
        status.kind === 'failed' || status.kind === 'canceled'
          ? { kind: 'queued' }
          : null
      );
    case 'clear-finished': {
      const remaining = items.filter(isDriveUploadActive);
      return remaining.length === items.length ? items : remaining;
    }
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

export function classifyDriveUploadError(error: unknown): DriveUploadFailure {
  if (error instanceof InternalApiError) {
    if (error.status === 413) {
      return /storage limit/i.test(error.message) ? 'quota' : 'too_large';
    }
    if (error.status === 415) return 'type';
    if (error.status === 401 || error.status === 403) return 'denied';
    return 'unknown';
  }
  if (error instanceof DriveUploadProviderError) {
    if (error.status === 413) return 'too_large';
    if (error.status === 415) return 'type';
    if (error.status >= 500) return 'unavailable';
    if (error.status >= 400) return 'rejected';
    return 'unknown';
  }
  if (error instanceof DriveUploadNetworkError) return 'network';
  return 'unknown';
}

/** The file transfer never got a response: offline, blocked or dropped. */
export class DriveUploadNetworkError extends Error {
  constructor(message = 'Upload transfer failed') {
    super(message);
    this.name = 'DriveUploadNetworkError';
  }
}

/** The storage provider answered the signed PUT with an error status. */
export class DriveUploadProviderError extends Error {
  constructor(public readonly status: number) {
    super(`Upload rejected (${status})`);
    this.name = 'DriveUploadProviderError';
  }
}

export interface DriveUploadSummary {
  activeCount: number;
  doneCount: number;
  failedCount: number;
  total: number;
  /** Bytes transferred across active and completed uploads, 0–100. */
  percent: number;
}

export function summarizeDriveUploads(
  items: DriveUploadItem[]
): DriveUploadSummary {
  let activeCount = 0;
  let doneCount = 0;
  let failedCount = 0;
  let loaded = 0;
  let size = 0;

  for (const item of items) {
    const { status } = item;
    if (status.kind === 'canceled') continue;
    if (status.kind === 'failed') {
      failedCount += 1;
      continue;
    }
    size += item.size;
    if (status.kind === 'done') {
      doneCount += 1;
      loaded += item.size;
    } else {
      activeCount += 1;
      if (status.kind === 'uploading') loaded += status.loaded;
      if (status.kind === 'finalizing') loaded += item.size;
    }
  }

  return {
    activeCount,
    doneCount,
    failedCount,
    total: items.length,
    percent: size > 0 ? Math.round((loaded / size) * 100) : 0,
  };
}

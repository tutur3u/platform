import { InternalApiError } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  classifyDriveUploadError,
  type DriveUploadItem,
  DriveUploadNetworkError,
  DriveUploadProviderError,
  driveUploadReducer,
  summarizeDriveUploads,
} from './drive-upload-queue';
import {
  DriveUploadAbortedError,
  isContentTypeRejection,
} from './drive-upload-transfer';

const enqueue = (sizes: number[]) =>
  driveUploadReducer([], {
    type: 'enqueue',
    items: sizes.map((size, index) => ({
      id: `u${index}`,
      name: `file-${index}.png`,
      path: 'marketing',
      size,
    })),
  });

const statusOf = (items: DriveUploadItem[], id: string) =>
  items.find((item) => item.id === id)?.status;

describe('driveUploadReducer', () => {
  it('moves an upload through queued, uploading, finalizing and done', () => {
    let items = enqueue([100]);
    expect(statusOf(items, 'u0')).toEqual({ kind: 'queued' });
    items = driveUploadReducer(items, { type: 'start', id: 'u0' });
    items = driveUploadReducer(items, {
      type: 'progress',
      id: 'u0',
      loaded: 140,
    });
    expect(statusOf(items, 'u0')).toEqual({ kind: 'uploading', loaded: 100 });
    items = driveUploadReducer(items, { type: 'finalize', id: 'u0' });
    items = driveUploadReducer(items, { type: 'succeed', id: 'u0' });
    expect(statusOf(items, 'u0')).toEqual({ kind: 'done' });
  });

  it('ignores progress after a cancel and only retries failed or canceled uploads', () => {
    let items = driveUploadReducer(enqueue([100]), { type: 'start', id: 'u0' });
    items = driveUploadReducer(items, { type: 'cancel', id: 'u0' });
    const canceled = items;
    items = driveUploadReducer(items, {
      type: 'progress',
      id: 'u0',
      loaded: 50,
    });
    expect(items).toBe(canceled);
    items = driveUploadReducer(items, { type: 'retry', id: 'u0' });
    expect(statusOf(items, 'u0')).toEqual({ kind: 'queued' });

    const done = driveUploadReducer(
      driveUploadReducer(items, { type: 'start', id: 'u0' }),
      { type: 'succeed', id: 'u0' }
    );
    expect(driveUploadReducer(done, { type: 'retry', id: 'u0' })).toBe(done);
    expect(
      driveUploadReducer(done, { type: 'fail', id: 'u0', reason: 'quota' })
    ).toBe(done);
  });

  it('clears finished uploads and keeps active ones', () => {
    let items = enqueue([10, 20]);
    items = driveUploadReducer(items, { type: 'start', id: 'u0' });
    items = driveUploadReducer(items, { type: 'succeed', id: 'u0' });
    items = driveUploadReducer(items, { type: 'clear-finished' });
    expect(items.map((item) => item.id)).toEqual(['u1']);
  });
});

describe('summarizeDriveUploads', () => {
  it('reports byte progress over uploads that are not failed or canceled', () => {
    let items = enqueue([100, 100, 100]);
    items = driveUploadReducer(items, { type: 'start', id: 'u0' });
    items = driveUploadReducer(items, {
      type: 'progress',
      id: 'u0',
      loaded: 50,
    });
    items = driveUploadReducer(items, { type: 'start', id: 'u1' });
    items = driveUploadReducer(items, {
      type: 'fail',
      id: 'u1',
      reason: 'quota',
    });

    expect(summarizeDriveUploads(items)).toEqual({
      activeCount: 2,
      doneCount: 0,
      failedCount: 1,
      total: 3,
      percent: 25,
    });
  });
});

describe('classifyDriveUploadError', () => {
  it.each([
    [
      new InternalApiError(
        'Workspace storage limit exceeded. Please free up space or upgrade your plan.',
        413
      ),
      'quota',
    ],
    [new InternalApiError('File size exceeds 100 MB limit', 413), 'too_large'],
    [new InternalApiError('File type not allowed', 415), 'type'],
    [new InternalApiError('Insufficient permissions', 403), 'denied'],
    [new DriveUploadNetworkError(), 'network'],
    [new DriveUploadProviderError(413), 'too_large'],
    [new DriveUploadProviderError(415), 'type'],
    [new DriveUploadProviderError(403), 'rejected'],
    [new DriveUploadProviderError(503), 'unavailable'],
    [new Error('boom'), 'unknown'],
  ])('classifies %s as %s', (error, reason) => {
    expect(classifyDriveUploadError(error)).toBe(reason);
  });
});

describe('isContentTypeRejection', () => {
  it('retries without Content-Type only after a 400 or 415 from the provider', () => {
    expect(isContentTypeRejection(new DriveUploadProviderError(400))).toBe(
      true
    );
    expect(isContentTypeRejection(new DriveUploadProviderError(415))).toBe(
      true
    );
    expect(isContentTypeRejection(new DriveUploadProviderError(403))).toBe(
      false
    );
    expect(isContentTypeRejection(new DriveUploadNetworkError())).toBe(false);
    expect(isContentTypeRejection(new DriveUploadAbortedError())).toBe(false);
  });
});

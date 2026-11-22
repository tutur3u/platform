import { InternalApiError } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import { getMoveFailureKey } from './drive-move-dialog';
import { getMoveTargetBlock } from './drive-move-target';
import { validateFolderName } from './drive-new-folder-dialog';
import { stepZoom } from './drive-preview-media';
import {
  getDriveQuotaTone,
  resolveDriveQuotaState,
} from './drive-storage-quota';

describe('getMoveTargetBlock', () => {
  const folder = { name: 'reports' };
  const file = { id: '1', name: 'a.png' };

  it('blocks the source folder and a moving folder or its descendants', () => {
    expect(getMoveTargetBlock('docs', 'docs', [file])).toBe('same');
    expect(getMoveTargetBlock('docs', 'docs/reports', [folder])).toBe('inside');
    expect(getMoveTargetBlock('', 'reports/2026', [folder])).toBe('inside');
    expect(getMoveTargetBlock('docs', 'docs/reports-old', [folder])).toBeNull();
    expect(getMoveTargetBlock('docs', '', [folder, file])).toBeNull();
  });
});

describe('drive storage quota', () => {
  it('warns from 90% and turns critical when full', () => {
    expect(getDriveQuotaTone(89.9)).toBe('normal');
    expect(getDriveQuotaTone(90)).toBe('warning');
    expect(getDriveQuotaTone(100)).toBe('critical');
  });

  it('keeps loading, error and ready distinct', () => {
    expect(resolveDriveQuotaState({ status: 'pending' })).toEqual({
      kind: 'loading',
    });
    expect(resolveDriveQuotaState({ status: 'error' })).toEqual({
      kind: 'error',
    });
    expect(
      resolveDriveQuotaState({
        data: { storageLimit: 100, totalSize: 95, usagePercentage: 95 },
        status: 'success',
      })
    ).toEqual({
      kind: 'ready',
      limit: 100,
      percent: 95,
      tone: 'warning',
      used: 95,
    });
  });
});

describe('stepZoom', () => {
  it('moves between fixed steps and stops at both ends', () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(4, 1)).toBe(4);
    expect(stepZoom(0.25, -1)).toBe(0.25);
  });
});

describe('validateFolderName', () => {
  it('requires a name without slashes', () => {
    expect(validateFolderName('  ')).toBe('required');
    expect(validateFolderName('a/b')).toBe('invalid');
    expect(validateFolderName('..')).toBe('invalid');
    expect(validateFolderName('Reports')).toBeNull();
  });
});

describe('getMoveFailureKey', () => {
  it('names provider, conflict and size failures from the move route', () => {
    const failure = (code: string) =>
      getMoveFailureKey(new InternalApiError('x', 409, code));
    expect(failure('DRIVE_MOVE_PROVIDER')).toBe('failed_provider');
    expect(failure('DRIVE_MOVE_CONFLICT')).toBe('failed_conflict');
    expect(failure('DRIVE_MOVE_SIZE')).toBe('failed_size');
    expect(getMoveFailureKey(new Error('x'))).toBe('failed');
  });
});

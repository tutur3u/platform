import { InternalApiError } from '@tuturuuu/internal-api/client';
import { describe, expect, it, vi } from 'vitest';
import {
  getAvatarUploadLimit,
  uploadWorkspaceUserAvatarWithLimitNotice,
} from './avatar-upload-limit';

const limited = (retryAfter?: number) =>
  new InternalApiError('limit', 429, 'PROFILE_UPLOAD_LIMIT', retryAfter);

it('ignores errors that are not a 429 from the upload issuer', () => {
  expect(getAvatarUploadLimit(new InternalApiError('x', 503))).toBeNull();
  expect(getAvatarUploadLimit(new Error('x'))).toBeNull();
  expect(getAvatarUploadLimit('429')).toBeNull();
});
it('rounds the retry time up to whole minutes under an hour', () => {
  expect(getAvatarUploadLimit(limited(1))).toEqual({
    retry: { unit: 'minutes', count: 1 },
  });
  expect(getAvatarUploadLimit(limited(1800))).toEqual({
    retry: { unit: 'minutes', count: 30 },
  });
  expect(getAvatarUploadLimit(limited(3599))).toEqual({
    retry: { unit: 'minutes', count: 60 },
  });
});
it('switches to hours from one hour', () => {
  expect(getAvatarUploadLimit(limited(3600))).toEqual({
    retry: { unit: 'hours', count: 1 },
  });
  expect(getAvatarUploadLimit(limited(127800))).toEqual({
    retry: { unit: 'hours', count: 36 },
  });
});
it('still reports the limit when no retry time is known', () => {
  expect(getAvatarUploadLimit(limited())).toEqual({});
});

const uploads = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('@tuturuuu/internal-api/profile-media', () => ({
  uploadWorkspaceUserAvatar: uploads.upload,
}));

describe('uploadWorkspaceUserAvatarWithLimitNotice', () => {
  const t = (key: string, values?: Record<string, number>) =>
    `${key}:${values?.count ?? ''}`;
  const file = new File(['x'], 'a.png', { type: 'image/png' });

  it('returns the public URL on success', async () => {
    uploads.upload.mockResolvedValue('https://cdn.test/a.webp');
    await expect(
      uploadWorkspaceUserAvatarWithLimitNotice('ws', file, t)
    ).resolves.toBe('https://cdn.test/a.webp');
  });
  it('turns the real 429 into a translated retry message', async () => {
    uploads.upload.mockRejectedValue(limited(1800));
    await expect(
      uploadWorkspaceUserAvatarWithLimitNotice('ws', file, t)
    ).rejects.toThrow('ws-users.avatar_upload_limit_minutes:30');
    uploads.upload.mockRejectedValue(limited(7300));
    await expect(
      uploadWorkspaceUserAvatarWithLimitNotice('ws', file, t)
    ).rejects.toThrow('ws-users.avatar_upload_limit_hours:3');
    uploads.upload.mockRejectedValue(limited());
    await expect(
      uploadWorkspaceUserAvatarWithLimitNotice('ws', file, t)
    ).rejects.toThrow('ws-users.avatar_upload_limit:');
  });
  it('rethrows every other failure untouched', async () => {
    const failure = new InternalApiError('Avatar upload unavailable', 503);
    uploads.upload.mockRejectedValue(failure);
    await expect(
      uploadWorkspaceUserAvatarWithLimitNotice('ws', file, t)
    ).rejects.toBe(failure);
  });
});

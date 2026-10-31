import { InternalApiError } from '@tuturuuu/internal-api/client';
import { uploadWorkspaceUserAvatar } from '@tuturuuu/internal-api/profile-media';

export interface AvatarUploadLimit {
  /** Whole units until the limit resets; absent when the server gave no hint. */
  retry?: { unit: 'minutes' | 'hours'; count: number };
}

type Translate = (key: string, values?: Record<string, number>) => string;

/** Recognize the 429 from the avatar ticket route and normalize its retry time. */
export function getAvatarUploadLimit(error: unknown): AvatarUploadLimit | null {
  if (!(error instanceof InternalApiError) || error.status !== 429) return null;
  const seconds = error.retryAfter;
  if (!seconds || seconds < 1) return {};
  return seconds < 3600
    ? { retry: { unit: 'minutes', count: Math.ceil(seconds / 60) } }
    : { retry: { unit: 'hours', count: Math.ceil(seconds / 3600) } };
}

/** Upload a managed user's avatar; a 429 becomes a translated "try again in X" error. */
export async function uploadWorkspaceUserAvatarWithLimitNotice(
  wsId: string,
  file: File,
  t: Translate
) {
  try {
    return await uploadWorkspaceUserAvatar(wsId, file);
  } catch (error) {
    const limit = getAvatarUploadLimit(error);
    if (!limit) throw error;
    throw new Error(
      limit.retry
        ? t(`ws-users.avatar_upload_limit_${limit.retry.unit}`, {
            count: limit.retry.count,
          })
        : t('ws-users.avatar_upload_limit')
    );
  }
}

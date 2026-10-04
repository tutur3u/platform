import {
  type ProfileMediaKind,
  reserveProfileUploadBudget,
} from '@tuturuuu/storage-core/profile-upload-budget';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { createAppCoordinationToken } from '@tuturuuu/utils/app-coordination-token';
import { publicStorageUrl } from './profile-media-public-url';

export async function createOptimizedProfileMediaTicket(
  userId: string,
  kind: ProfileMediaKind,
  origin: string,
  workspaceId?: string,
  avatarPrefix?: string
) {
  await reserveProfileUploadBudget(userId, kind);
  const { token, claims } = createAppCoordinationToken({
    userId,
    targetApp: 'profile-media-upload',
    scopes: [
      `profile-media:${kind}`,
      ...(avatarPrefix
        ? [`avatar-prefix:${avatarPrefix}`]
        : workspaceId
          ? [`workspace:${workspaceId}`]
          : []),
    ],
    expiresInSeconds: 600,
  });
  const filePath = avatarPrefix
    ? `${avatarPrefix}/${claims.jti}.webp`
    : workspaceId
      ? `workspaces/${workspaceId}/avatar-${claims.jti}.webp`
      : `${userId}/${claims.jti}.webp`;
  const admin = await createAdminClient({ noCookie: true });
  const storage = admin.storage.from(kind === 'avatar' ? 'avatars' : 'banners');
  const uploadUrl = new URL(`/api/v1/users/me/${kind}/upload`, origin);
  uploadUrl.searchParams.set('token', token);
  return {
    uploadUrl: uploadUrl.toString(),
    signedUrl: uploadUrl.toString(),
    token,
    filePath,
    publicUrl: publicStorageUrl(storage.getPublicUrl(filePath).data.publicUrl),
  };
}

/** Lifecycle reservation already charged the budget; mint only a bounded capability. */
export function createOptimizedBannerOperationTicket(
  userId: string,
  operationId: string,
  origin: string
) {
  const { token } = createAppCoordinationToken({
    userId,
    targetApp: 'profile-media-upload',
    scopes: ['profile-media:banner', `banner-operation:${operationId}`],
    expiresInSeconds: 600,
  });
  const uploadUrl = new URL('/api/v1/users/me/banner/upload', origin);
  uploadUrl.searchParams.set('token', token);
  return { uploadUrl: uploadUrl.toString(), token };
}

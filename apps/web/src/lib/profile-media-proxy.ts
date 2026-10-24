import { PROFILE_MEDIA_MAX_BYTES } from '@tuturuuu/storage-core/profile-upload-budget';

export function profileMediaProxyPayloadLimit(
  method: string,
  pathname: string
) {
  if (method !== 'PUT') return undefined;
  if (pathname === '/api/v1/users/me/avatar/upload')
    return PROFILE_MEDIA_MAX_BYTES.avatar;
  if (pathname === '/api/v1/users/me/banner/upload')
    return PROFILE_MEDIA_MAX_BYTES.banner;
  return undefined;
}

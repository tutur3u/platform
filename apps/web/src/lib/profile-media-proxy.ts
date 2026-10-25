import { PROFILE_MEDIA_MAX_BYTES } from '@tuturuuu/storage-core/profile-upload-limits';

export function profileMediaProxyPayloadLimit(
  method: string,
  url: Pick<URL, 'pathname' | 'searchParams'>
) {
  if (method !== 'PUT' || !url.searchParams.get('token')) return undefined;
  if (url.pathname === '/api/v1/users/me/avatar/upload')
    return PROFILE_MEDIA_MAX_BYTES.avatar;
  if (url.pathname === '/api/v1/users/me/banner/upload')
    return PROFILE_MEDIA_MAX_BYTES.banner;
  return undefined;
}

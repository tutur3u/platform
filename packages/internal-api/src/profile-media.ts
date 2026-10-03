import { getInternalApiClient, type InternalApiClientOptions } from './client';
import { optimizeProfileMediaFile } from './profile-media-optimize';

export {
  optimizeProfileMediaFile,
  PROFILE_MEDIA_OUTPUT_BYTES,
  PROFILE_MEDIA_SOURCE_BYTES,
} from './profile-media-optimize';

export type ProfileMediaKind = 'avatar' | 'banner';
const maximumBytes = { avatar: 2 * 1024 ** 2, banner: 5 * 1024 ** 2 } as const;
const mimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
/** Uploads a new object; the caller saves its URL with the rest of the profile. */
export async function uploadCurrentUserProfileMedia(
  kind: ProfileMediaKind,
  file: File,
  options?: InternalApiClientOptions
) {
  if (
    !mimeTypes.has(file.type) ||
    file.size < 1 ||
    file.size > maximumBytes[kind]
  )
    throw new Error('Invalid profile image');
  const optimized = await optimizeProfileMediaFile(file, kind);
  const client = getInternalApiClient(options);
  const ticket = await client.json<{ uploadUrl: string; publicUrl: string }>(
    `/api/v1/users/me/${kind}/upload-url`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: optimized.name }),
      cache: 'no-store',
    }
  );
  const storageFetch = options?.fetch ?? globalThis.fetch;
  const response = await storageFetch(ticket.uploadUrl, {
    credentials: 'omit',
    method: 'PUT',
    headers: { 'Content-Type': optimized.type },
    body: optimized,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Unable to upload profile image');
  return ticket.publicUrl;
}

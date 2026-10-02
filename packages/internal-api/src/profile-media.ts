import { getInternalApiClient, type InternalApiClientOptions } from './client';

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
  const client = getInternalApiClient(options);
  const ticket = await client.json<{ uploadUrl: string; publicUrl: string }>(
    `/api/v1/users/me/${kind}/upload-url`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name }),
      cache: 'no-store',
    }
  );
  // A signed Storage ticket is its own authority; never forward API credentials.
  const storageFetch = options?.fetch ?? globalThis.fetch;
  const response = await storageFetch(ticket.uploadUrl, {
    method: 'PUT',
    credentials: 'omit',
    headers: { 'Content-Type': file.type },
    body: file,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Unable to upload profile image');
  return ticket.publicUrl;
}

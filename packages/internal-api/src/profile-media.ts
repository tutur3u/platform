import { getInternalApiClient, type InternalApiClientOptions } from './client';
import { optimizeProfileMediaFile } from './profile-media-optimize';

export {
  optimizeProfileMediaFile,
  PROFILE_MEDIA_OUTPUT_BYTES,
  PROFILE_MEDIA_SOURCE_BYTES,
} from './profile-media-optimize';

export type ProfileMediaKind = 'avatar' | 'banner';
export interface ProfileMediaUploadTicket {
  uploadUrl: string;
  publicUrl: string;
  filePath: string;
  token: string;
}

/** Authenticated actor-owned upload ticket; callers cannot choose an actor. */
export function createProfileMediaUploadTicket(
  kind: ProfileMediaKind,
  filename: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<ProfileMediaUploadTicket>(
    `/api/v1/users/me/${kind}/upload-url`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    }
  );
}
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
  // The signed capability is its own authority; never forward API credentials.
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

/** Managed contact avatars use the same optimized transport as shared identity. */
export async function createWorkspaceUserAvatarUploadUrl(
  wsId: string,
  contentType: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    signedUrl: string;
    publicUrl: string;
    path: string;
  }>(`/api/v1/workspaces/${encodeURIComponent(wsId)}/users/avatar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType }),
    cache: 'no-store',
  });
}
export async function uploadWorkspaceUserAvatar(
  wsId: string,
  file: File,
  options?: InternalApiClientOptions
) {
  const optimized = await optimizeProfileMediaFile(file, 'avatar');
  const ticket = await createWorkspaceUserAvatarUploadUrl(
    wsId,
    optimized.type,
    options
  );
  const response = await (options?.fetch ?? globalThis.fetch)(
    ticket.signedUrl,
    {
      method: 'PUT',
      credentials: 'omit',
      body: optimized,
      headers: { 'Content-Type': optimized.type },
      cache: 'no-store',
    }
  );
  if (!response.ok) throw new Error('Unable to upload profile image');
  return ticket.publicUrl;
}

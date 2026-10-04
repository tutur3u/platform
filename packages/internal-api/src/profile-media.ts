import { getInternalApiClient, type InternalApiClientOptions } from './client';

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

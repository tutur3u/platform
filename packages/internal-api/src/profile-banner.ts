import { getInternalApiClient, type InternalApiClientOptions } from './client';
import { optimizeProfileMediaFile } from './profile-media-optimize';

type BannerTicket = {
  operationId: string;
  publicUrl: string;
  uploadUrl?: string;
  committed?: boolean;
  uploaded?: boolean;
};

/** Preserve the receipt across retries, including a lost upload response. */
export async function uploadCurrentUserBanner(
  file: File,
  operationId: string = crypto.randomUUID(),
  options?: InternalApiClientOptions
) {
  const optimized = await optimizeProfileMediaFile(file, 'banner');
  const client = getInternalApiClient(options);
  const ticket = await client.json<BannerTicket>(
    '/api/v1/users/me/banner/upload-url',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: optimized.name, operationId }),
      cache: 'no-store',
    }
  );
  if (ticket.operationId !== operationId || !ticket.publicUrl)
    throw new Error('Invalid banner upload receipt');
  if (!ticket.committed) {
    if (!ticket.uploaded) {
      if (!ticket.uploadUrl)
        throw new Error('Missing banner upload capability');
      const response = await (options?.fetch ?? globalThis.fetch)(
        ticket.uploadUrl,
        {
          method: 'PUT',
          credentials: 'omit',
          headers: { 'Content-Type': optimized.type },
          body: optimized,
          cache: 'no-store',
        }
      );
      if (!response.ok) throw new Error('Unable to upload banner');
    }
    await client.json('/api/v1/users/me/banner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'finalize', operationId }),
      cache: 'no-store',
    });
  }
  return { publicUrl: ticket.publicUrl };
}

export function removeCurrentUserBanner(
  operationId: string = crypto.randomUUID(),
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json('/api/v1/users/me/banner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'remove', operationId }),
    cache: 'no-store',
  });
}

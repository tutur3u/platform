import { getInternalApiClient, type InternalApiClientOptions } from './client';
import { optimizeProfileMediaFile } from './profile-media-optimize';

type BannerMutationOptions = InternalApiClientOptions & {
  expectedActorId?: string;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
};

function assertCurrent(options?: BannerMutationOptions) {
  if (options?.signal?.aborted || options?.isCurrent?.() === false)
    throw new DOMException('Profile actor changed', 'AbortError');
}

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
  options?: BannerMutationOptions
) {
  assertCurrent(options);
  const optimized = await optimizeProfileMediaFile(file, 'banner');
  assertCurrent(options);
  const client = getInternalApiClient(options);
  const ticket = await client.json<BannerTicket>(
    '/api/v1/users/me/banner/upload-url',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: optimized.name,
        operationId,
        expectedActorId: options?.expectedActorId,
      }),
      cache: 'no-store',
      signal: options?.signal,
    }
  );
  assertCurrent(options);
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
          signal: options?.signal,
        }
      );
      if (!response.ok) throw new Error('Unable to upload banner');
    }
    assertCurrent(options);
    await client.json('/api/v1/users/me/banner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'finalize',
        operationId,
        expectedActorId: options?.expectedActorId,
      }),
      cache: 'no-store',
      signal: options?.signal,
    });
  }
  assertCurrent(options);
  return { publicUrl: ticket.publicUrl };
}

export function removeCurrentUserBanner(
  operationId: string = crypto.randomUUID(),
  options?: BannerMutationOptions
) {
  assertCurrent(options);
  return getInternalApiClient(options).json('/api/v1/users/me/banner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'remove',
      operationId,
      expectedActorId: options?.expectedActorId,
    }),
    cache: 'no-store',
    signal: options?.signal,
  });
}

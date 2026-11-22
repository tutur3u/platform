import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

interface WorkspaceStorageShareLinkResponse {
  signedUrl?: string;
  /** Effective lifetime in seconds after the server clamps the request. */
  expiresIn?: number;
  expiresAt?: string;
}

export interface WorkspaceStorageShareLink {
  url: string;
  /** Effective lifetime in seconds, or null when the server does not say. */
  expiresIn: number | null;
}

function readEffectiveTtl(
  payload: WorkspaceStorageShareLinkResponse,
  requestedAt: number
) {
  if (
    typeof payload.expiresIn === 'number' &&
    Number.isFinite(payload.expiresIn) &&
    payload.expiresIn > 0
  ) {
    return Math.trunc(payload.expiresIn);
  }
  if (typeof payload.expiresAt === 'string') {
    const seconds = Math.trunc(
      (Date.parse(payload.expiresAt) - requestedAt) / 1000
    );
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }
  return null;
}

/**
 * Signs a read link for one workspace object and reports how long it works.
 * The server owns the lifetime: it clamps any requested value, so callers
 * show the returned lifetime instead of the one they asked for.
 */
export async function createWorkspaceStorageShareLink(
  workspaceId: string,
  path: string,
  options?: { expiresIn?: number },
  clientOptions?: InternalApiClientOptions
): Promise<WorkspaceStorageShareLink> {
  const client = getInternalApiClient(clientOptions);
  const requestedAt = Date.now();
  const payload = await client.json<WorkspaceStorageShareLinkResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/share`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, expiresIn: options?.expiresIn }),
      cache: 'no-store',
    }
  );

  if (!payload.signedUrl) {
    throw new Error('Missing signed URL');
  }

  return {
    url: payload.signedUrl,
    expiresIn: readEffectiveTtl(payload, requestedAt),
  };
}

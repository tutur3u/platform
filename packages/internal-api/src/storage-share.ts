import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

interface WorkspaceStorageShareLinkResponse {
  signedUrl?: string;
  /** Lifetime in seconds after the server clamps the request. */
  expiresIn?: number;
  /** ISO time the signed link stops working. */
  expiresAt?: string;
}

export interface WorkspaceStorageShareLink {
  url: string;
  /** Effective lifetime in seconds, or null when the server does not say. */
  expiresIn: number | null;
  /** ISO expiry time, or null when the server does not say. */
  expiresAt: string | null;
}

function readEffectiveTtl(payload: WorkspaceStorageShareLinkResponse) {
  const { expiresIn } = payload;
  return typeof expiresIn === 'number' &&
    Number.isFinite(expiresIn) &&
    expiresIn > 0
    ? Math.trunc(expiresIn)
    : null;
}

function readExpiresAt(payload: WorkspaceStorageShareLinkResponse) {
  const { expiresAt } = payload;
  return typeof expiresAt === 'string' && Number.isFinite(Date.parse(expiresAt))
    ? expiresAt
    : null;
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
    expiresIn: readEffectiveTtl(payload),
    expiresAt: readExpiresAt(payload),
  };
}

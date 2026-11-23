import { getInternalApiClient, type InternalApiClientOptions } from './client';

export type UpskiiLinkSummary = {
  linkedAt: string;
  linkId: string;
  scopes: string[];
  upskiiEmail: string | null;
};

export type UpskiiLinkStatus = {
  canLink: boolean;
  link: UpskiiLinkSummary | null;
};

const UPSKII_LINK_PATH = '/api/v1/integrations/upskii/link';

/** The signed-in user's Upskii account link. */
export async function getUpskiiLinkStatus(options?: InternalApiClientOptions) {
  const client = getInternalApiClient(options);
  return client.json<UpskiiLinkStatus>(UPSKII_LINK_PATH, {
    cache: 'no-store',
  });
}

/** Disconnects the signed-in user's Upskii account link. */
export async function disconnectUpskiiLink(options?: InternalApiClientOptions) {
  const client = getInternalApiClient(options);
  await client.json<void>(UPSKII_LINK_PATH, {
    cache: 'no-store',
    method: 'DELETE',
  });
}

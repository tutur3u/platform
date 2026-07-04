import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from '../client';

export interface ManagedCronWhitelistedDomain {
  created_at: string;
  created_by: string | null;
  description: string | null;
  domain: string;
  enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface ListManagedCronDomainsParams {
  page?: string;
  pageSize?: string;
  q?: string;
}

export interface ManagedCronDomainsResponse {
  count: number;
  data: ManagedCronWhitelistedDomain[];
}

export interface ManagedCronDomainResponse {
  data: ManagedCronWhitelistedDomain;
}

export interface CreateManagedCronDomainPayload {
  description?: string | null;
  domain: string;
  enabled?: boolean;
}

export interface UpdateManagedCronDomainPayload {
  enabled: boolean;
}

export async function listManagedCronWhitelistedDomains(
  params?: ListManagedCronDomainsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ManagedCronDomainsResponse>(
    '/api/v1/infrastructure/cron/whitelist/domains',
    {
      cache: 'no-store',
      query: {
        page: params?.page,
        pageSize: params?.pageSize,
        q: params?.q,
      },
    }
  );
}

export async function createManagedCronWhitelistedDomain(
  payload: CreateManagedCronDomainPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ManagedCronDomainResponse>(
    '/api/v1/infrastructure/cron/whitelist/domains',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateManagedCronWhitelistedDomain(
  domain: string,
  payload: UpdateManagedCronDomainPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/infrastructure/cron/whitelist/domain/${encodePathSegment(domain)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export async function deleteManagedCronWhitelistedDomain(
  domain: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/infrastructure/cron/whitelist/domain/${encodePathSegment(domain)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export async function listInquiryMediaUrls(
  inquiryId: string,
  mediaPaths: string[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ urls: Record<string, string> }>(
    `/api/v1/inquiries/${encodePathSegment(inquiryId)}/media-urls`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mediaPaths }),
      cache: 'no-store',
    }
  );

  return payload.urls ?? {};
}

export async function updateInquiry(
  inquiryId: string,
  updates: { is_read?: boolean; is_resolved?: boolean },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: unknown }>(
    `/api/v1/inquiries/${encodePathSegment(inquiryId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
      cache: 'no-store',
    }
  );
}

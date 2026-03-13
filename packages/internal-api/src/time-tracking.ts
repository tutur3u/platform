import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

interface TimeTrackingRequestImageUrl {
  path: string;
  signedUrl: string | null;
}

interface TimeTrackingRequestImageUrlsResponse {
  urls: TimeTrackingRequestImageUrl[];
}

export async function getTimeTrackingRequestImageUrls(
  workspaceId: string,
  requestId: string,
  imagePaths: string[],
  options?: InternalApiClientOptions
) {
  if (imagePaths.length === 0) {
    return [];
  }

  const client = getInternalApiClient(options);
  const payload = await client.json<TimeTrackingRequestImageUrlsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/time-tracking/requests/${encodePathSegment(requestId)}/image-urls`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imagePaths }),
    }
  );

  return payload.urls ?? [];
}

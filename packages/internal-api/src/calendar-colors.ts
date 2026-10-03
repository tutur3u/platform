import type { GoogleProviderColorOptions } from '@tuturuuu/types/primitives/google-calendar-color';
import type { InternalApiClientOptions } from './client';
import { encodePathSegment, getInternalApiClient } from './client';

export type {
  GoogleProviderColorChoice,
  GoogleProviderColorOptions,
} from '@tuturuuu/types/primitives/google-calendar-color';

export async function getGoogleCalendarColorOptions(
  wsId: string,
  connectionId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<GoogleProviderColorOptions>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/colors`,
    {
      query: { connectionId },
      cache: 'no-store',
    }
  );
}

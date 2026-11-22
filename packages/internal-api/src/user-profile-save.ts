import { getInternalApiClient, type InternalApiClientOptions } from './client';
import type {
  CurrentUserProfileResponse,
  UpdateCurrentUserProfilePayload,
} from './user-profile-types';

export async function updateCurrentUserProfile(
  payload: UpdateCurrentUserProfilePayload,
  options?: InternalApiClientOptions,
  /** A one-use Turnstile token answering an `ABUSE_CHALLENGE_REQUIRED` refusal. */
  verification?: { turnstileToken?: string }
) {
  const client = getInternalApiClient(options);
  return client.json<CurrentUserProfileResponse>('/api/v1/users/me/profile', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(verification?.turnstileToken
        ? { 'x-tuturuuu-turnstile-token': verification.turnstileToken }
        : {}),
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
}

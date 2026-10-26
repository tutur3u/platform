import { z } from 'zod';

const resetError = z.object({ code: z.literal('PASSWORD_RESET_REQUIRED') });

export async function challengePasswordErrorKey(response: Response) {
  if (response.status === 409) {
    const body: unknown = await response.json().catch(() => null);
    if (resetError.safeParse(body).success)
      return 'challenge_password_reset_required';
  }
  return 'challenge_password_invalid';
}

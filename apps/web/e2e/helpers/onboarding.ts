import type { BrowserContext } from '@playwright/test';

export async function markPersonalWorkspaceSubscriptionRepairAttempted(
  context: BrowserContext,
  origin: string
) {
  await context.addCookies([
    {
      httpOnly: true,
      name: 'subscription_fix_attempted',
      sameSite: 'Lax',
      secure: origin.startsWith('https://'),
      url: origin,
      value: '1',
    },
  ]);
}

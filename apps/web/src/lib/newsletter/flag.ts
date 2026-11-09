import { verifySecret } from '@tuturuuu/utils/workspace-helper';

export const NEWSLETTER_SENDING_FLAG = 'newsletter_sending';

export async function isNewsletterSendingEnabled(
  wsId: string
): Promise<boolean> {
  return verifySecret({
    forceAdmin: true,
    name: NEWSLETTER_SENDING_FLAG,
    value: 'true',
    wsId,
  });
}

import {
  MAX_EMAIL_LENGTH,
  MAX_SUPPORT_INQUIRY_MESSAGE_LENGTH,
  MAX_SUPPORT_INQUIRY_NAME_LENGTH,
  MAX_SUPPORT_INQUIRY_SUBJECT_LENGTH,
} from '@tuturuuu/utils/constants';
import { z } from 'zod';
export const INQUIRY_PRODUCTS = [
  'web',
  'nova',
  'rewise',
  'calendar',
  'finance',
  'tudo',
  'tumeet',
  'shortener',
  'qr',
  'drive',
  'mail',
  'other',
] as const;
export const createInquirySchema = z.object({
  name: z.string().min(2).max(MAX_SUPPORT_INQUIRY_NAME_LENGTH),
  email: z.email().max(MAX_EMAIL_LENGTH),
  type: z.enum(['bug', 'feature-request', 'support', 'job-application']),
  product: z.enum(INQUIRY_PRODUCTS),
  subject: z.string().min(5).max(MAX_SUPPORT_INQUIRY_SUBJECT_LENGTH),
  message: z.string().min(10).max(MAX_SUPPORT_INQUIRY_MESSAGE_LENGTH),
});
export function permitsSupportCookieMutation(request: Request) {
  if (
    !request.headers.has('cookie') ||
    (request.headers.get('authorization')?.startsWith('Bearer ') &&
      request.headers.get('authorization')!.slice(7).trim())
  )
    return true;
  const supplied =
    request.headers.get('origin') ?? request.headers.get('referer');
  if (!supplied) return false;
  try {
    return new URL(supplied).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

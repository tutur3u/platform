import { handleSesNotificationRequest } from '@/lib/ses-notifications/handler';
import { createSesNotificationDeps } from '@/lib/ses-notifications/runtime';

/**
 * SES bounce and complaint notifications via SNS. Public by design: every
 * request is checked against the topic allowlist and the SNS signature.
 */
export async function POST(request: Request) {
  return handleSesNotificationRequest(request, createSesNotificationDeps());
}

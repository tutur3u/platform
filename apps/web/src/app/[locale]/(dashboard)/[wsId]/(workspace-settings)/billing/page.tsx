import { redirect } from 'next/navigation';
import { getPayBillingUrl } from '@/lib/pay-app-url';

/**
 * Billing has moved to the dedicated pay.tuturuuu.com surface. This route is a
 * permanent redirect shim so existing `/{wsId}/billing` links keep working.
 */
export default async function BillingPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(getPayBillingUrl(wsId));
}

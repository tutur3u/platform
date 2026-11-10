import { redirect } from 'next/navigation';
import { buildPayBillingSuccessUrl } from '@/lib/pay-app-url';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function BillingSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ wsId }, query] = await Promise.all([params, searchParams]);
  redirect(buildPayBillingSuccessUrl(wsId, query));
}

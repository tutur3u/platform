import { redirect } from 'next/navigation';
import { buildWebDashboardRedirectUrl } from '@/lib/non-migrated-redirect';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string; wsId: string; catchAll: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Any workspace dashboard route contacts does not own falls through to apps/web.
export default async function NonMigratedWorkspaceRoute({
  params,
  searchParams,
}: Props) {
  const { locale, wsId, catchAll } = await params;
  redirect(
    buildWebDashboardRedirectUrl({
      locale,
      wsId,
      segments: catchAll,
      searchParams: await searchParams,
    })
  );
}

import { redirect } from 'next/navigation';
import { buildWebDashboardRedirectUrl } from '@/lib/non-migrated-redirect';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string; wsId: string; catchAll: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Non-migrated /users/* routes (groups, reports, attendance, approvals, etc.)
// are still owned by apps/web — redirect there instead of 404ing.
export default async function NonMigratedUsersRoute({
  params,
  searchParams,
}: Props) {
  const { locale, wsId, catchAll } = await params;
  redirect(
    buildWebDashboardRedirectUrl({
      locale,
      wsId,
      segments: ['users', ...catchAll],
      searchParams: await searchParams,
    })
  );
}

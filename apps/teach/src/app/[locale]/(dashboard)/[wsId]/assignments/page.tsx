import {
  getTeachBootstrap,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { OperationsPageClient } from '@/components/teach-operations/operations-page-client';
import { redirect } from '@/i18n/navigation';

export default async function TeachAssignmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; wsId: string }>;
  searchParams: Promise<{ course?: string }>;
}) {
  const { locale, wsId } = await params;
  const requestHeaders = await headers();
  const bootstrap = await getTeachBootstrap(
    withForwardedInternalApiAuth(requestHeaders)
  ).catch(() => null);

  if (!bootstrap)
    return redirect({ href: `/login?next=/${wsId}/assignments`, locale });
  if (!bootstrap.workspaces.some((workspace) => workspace.id === wsId)) {
    const fallbackId = bootstrap.workspaces[0]?.id;
    return redirect({
      href: fallbackId ? `/${fallbackId}` : '/dashboard',
      locale,
    });
  }

  const query = await searchParams;
  return (
    <OperationsPageClient
      initialCourseId={query.course}
      mode="assignments"
      wsId={wsId}
    />
  );
}

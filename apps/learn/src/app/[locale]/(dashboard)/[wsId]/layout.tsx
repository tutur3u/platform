import {
  getTulearnBootstrap,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { LearnerShell, NoWorkspaceState } from '@/components/learner-shell';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const requestHeaders = await headers();
  const bootstrap = await getTulearnBootstrap(
    withForwardedInternalApiAuth(requestHeaders)
  );

  if (!bootstrap.workspaces.length) {
    return <NoWorkspaceState />;
  }

  return (
    <LearnerShell bootstrap={bootstrap} wsId={wsId}>
      {children}
    </LearnerShell>
  );
}

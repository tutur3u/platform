import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import { RealtimeLogProvider } from '@tuturuuu/supabase/next/realtime-log-provider';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId: id } = await params;
  const user = getAppSessionUserFromRequest(
    { headers: await headers() },
    { targetApp: 'mail' }
  );

  if (!user?.id) redirect('/login');
  if (!isExactTuturuuuDotComEmail(user.email)) redirect('/not-available');

  const workspace = await getWorkspace(id, { useAdmin: true, user });

  if (!workspace) redirect('/onboarding');
  if (!workspace.joined) redirect('/');

  const wsId = workspace.id;
  const workspaceSlug = toWorkspaceSlug(wsId, {
    personal: !!workspace.personal,
  });

  return (
    <RealtimeLogProvider wsId={wsId}>
      <div data-workspace-slug={workspaceSlug}>{children}</div>
    </RealtimeLogProvider>
  );
}

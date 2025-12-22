import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import CalendarLabClientPage from './client';

export const metadata: Metadata = {
  title: 'Calendar Lab',
  description: 'Smart Scheduling Algorithm Visualization & Debugging Lab.',
};

interface PageProps {
  params: Promise<{
    wsId: string;
    locale: string;
  }>;
}

export default async function CalendarLabPage({ params }: PageProps) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ workspace, wsId }) => {
        const { withoutPermission } = await getPermissions({ wsId });

        const supabase = await createClient();

        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();

        // Security Check: Only Tuturuuu employees
        const isEmployee = user?.email?.endsWith('@tuturuuu.com');

        if (!isEmployee) {
          redirect(`/${wsId}/calendar`);
        }

        if (withoutPermission('manage_calendar')) redirect(`/${wsId}`);

        return (
          <div className="flex h-[calc(100vh-2rem)] w-full flex-col">
            <CalendarLabClientPage workspace={workspace} />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}

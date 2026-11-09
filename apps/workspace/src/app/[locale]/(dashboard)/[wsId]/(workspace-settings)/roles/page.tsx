import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export const metadata: Metadata = {
  title: 'Roles',
  description:
    'Manage Roles in the Workspace Settings area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

// Roles have been consolidated into the tabbed members page. This route is kept
// as a redirect so existing bookmarks and deep links land on the roles tab.
export default async function WorkspaceRolesPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        return redirect(`/${wsId}/members?tab=roles`);
      }}
    </WorkspaceWrapper>
  );
}

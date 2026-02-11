import HabitsClientPage from '@tuturuuu/ui/tu-do/habits/client';
import type { Metadata } from 'next';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export const metadata: Metadata = {
  title: 'Habits',
  description: 'Manage your recurring habits and track your streaks.',
};

interface PageProps {
  params: Promise<{
    wsId: string;
    locale: string;
  }>;
}

export default async function HabitsPage({ params }: PageProps) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        return <HabitsClientPage wsId={wsId} />;
      }}
    </WorkspaceWrapper>
  );
}

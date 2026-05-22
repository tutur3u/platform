import { MindDashboard } from '@tuturuuu/mind-ui/dashboard';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getWebMindWorkspaceContext } from '@/lib/mind-workspace-context';

export const metadata: Metadata = {
  title: 'Mind',
  description: 'Map ideas and AI research inside your Tuturuuu workspace.',
};

interface PageProps {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function MindPage({ params }: PageProps) {
  const { wsId } = await params;
  const context = await getWebMindWorkspaceContext(wsId);

  if (!context) notFound();

  return <MindDashboard mindPrefix="/mind" wsId={context.wsId} />;
}

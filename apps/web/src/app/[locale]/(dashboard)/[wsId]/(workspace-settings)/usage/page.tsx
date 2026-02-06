import type { Metadata } from 'next';
import UsageContent from './usage-content';

export const metadata: Metadata = {
  title: 'Usage',
  description: 'Manage Usage in your Tuturuuu workspace.',
};

interface PageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function UsagePage({ params }: PageProps) {
  const { wsId } = await params;
  return <UsageContent wsId={wsId} />;
}

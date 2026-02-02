import { DebtsPage } from '@tuturuuu/ui/finance/debts';
import type { Metadata } from 'next';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export const metadata: Metadata = {
  title: 'Debts & Loans',
  description:
    'Track and manage debts and loans in the Finance area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    type?: string;
  }>;
}

export default async function WorkspaceDebtsPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const sp = await searchParams;
        return <DebtsPage wsId={wsId} searchParams={sp} />;
      }}
    </WorkspaceWrapper>
  );
}

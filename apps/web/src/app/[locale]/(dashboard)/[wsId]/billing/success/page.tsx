import type { Metadata } from 'next';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import ClientComponent from './client-component';

export const metadata: Metadata = {
  title: 'Success',
  description: 'Manage Success in the Billing area of your Tuturuuu workspace.',
};

export default async function SuccessPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        return <ClientComponent wsId={wsId} />;
      }}
    </WorkspaceWrapper>
  );
}

import { approvalsColumns } from './columns';
import { StatusFilter } from './status-filter';
import { CustomDataTable } from '@/components/custom-data-table';
import { getPermissions } from '@/lib/workspace-helper';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
    status?: string;
  }>;
}

export default async function ApprovalsPage({ params, searchParams }: Props) {
  const { wsId } = await params;
  const { status } = await searchParams;
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  // Only allow root workspace access to approvals
  if (withoutPermission('view_infrastructure')) redirect(`/${wsId}/settings`);

  const approvals = await getApprovalRequests(await searchParams);

  return (
    <>
      <FeatureSummary
        pluralTitle="Workspace Approvals"
        description="Review and approve workspace feature requests from workspace creators."
      />
      <Separator className="my-4" />

      <div className="flex min-h-full w-full flex-col">
        <div className="mb-4 flex items-center justify-end">
          <div className="flex items-center gap-4">
            <StatusFilter currentStatus={status} />
          </div>
        </div>

        <CustomDataTable
          data={approvals.data}
          columnGenerator={approvalsColumns}
          count={approvals.count}
          defaultVisibility={{
            id: false,
            created_at: false,
          }}
        />
      </div>
    </>
  );
}

// Dummy function to simulate fetching approval requests
// This will be replaced with actual API calls later
const getApprovalRequests = async ({
  q,
  page = '1',
  pageSize = '10',
  status,
}: {
  q?: string;
  page?: string;
  pageSize?: string;
  status?: string;
}): Promise<{
  data: WorkspaceApprovalRequest[];
  count: number;
}> => {
  // Dummy data - replace with actual database query
  const dummyData: WorkspaceApprovalRequest[] = [
    {
      id: '1',
      workspace_id: 'ws-001',
      workspace_name: 'Marketing Team Workspace',
      creator_id: 'user-001',
      creator_name: 'John Smith',
      feature_requested: 'Advanced Analytics',
      request_message:
        'We need advanced analytics to track our marketing campaigns more effectively.',
      status: 'pending',
      created_at: '2024-01-15T10:30:00Z',
      updated_at: '2024-01-15T10:30:00Z',
    },
    {
      id: '2',
      workspace_id: 'ws-002',
      workspace_name: 'Product Development',
      creator_id: 'user-002',
      creator_name: 'Sarah Johnson',

      feature_requested: 'API Access',
      request_message:
        'We require API access to integrate with our existing development tools.',
      status: 'pending',
      created_at: '2024-01-14T14:22:00Z',
      updated_at: '2024-01-14T14:22:00Z',
    },
    {
      id: '3',
      workspace_id: 'ws-003',
      workspace_name: 'Customer Support Hub',
      creator_id: 'user-003',
      creator_name: 'Michael Chen',

      feature_requested: 'Premium Support',
      request_message:
        'Our team handles critical customer issues and needs priority support.',
      status: 'approved',
      created_at: '2024-01-13T09:15:00Z',
      updated_at: '2024-01-13T16:45:00Z',
    },
    {
      id: '4',
      workspace_id: 'ws-004',
      workspace_name: 'Sales Operations',
      creator_id: 'user-004',
      creator_name: 'Emily Davis',

      feature_requested: 'Custom Integrations',
      request_message:
        'We need custom integrations with our CRM system for better data flow.',
      status: 'rejected',
      created_at: '2024-01-12T11:20:00Z',
      updated_at: '2024-01-12T15:30:00Z',
    },
  ];

  // Simulate filtering and pagination
  let filteredData = dummyData;

  if (status && status !== 'all') {
    filteredData = filteredData.filter((item) => item.status === status);
  }

  if (q) {
    filteredData = filteredData.filter(
      (item) =>
        item.workspace_name.toLowerCase().includes(q.toLowerCase()) ||
        item.creator_name.toLowerCase().includes(q.toLowerCase()) ||
        item.feature_requested.toLowerCase().includes(q.toLowerCase())
    );
  }

  const startIndex = (parseInt(page) - 1) * parseInt(pageSize);
  const endIndex = startIndex + parseInt(pageSize);
  const paginatedData = filteredData.slice(startIndex, endIndex);

  return {
    data: paginatedData,
    count: filteredData.length,
  };
};

// Type definition for workspace approval requests
export interface WorkspaceApprovalRequest {
  id: string;
  workspace_id: string;
  workspace_name: string;
  creator_id: string;
  creator_name: string;
  feature_requested: string;
  request_message: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

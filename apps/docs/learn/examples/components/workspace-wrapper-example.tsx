/**
 * Example usage of WorkspaceWrapper component
 * This file demonstrates various patterns for using the WorkspaceWrapper
 */
import WorkspaceWrapper from '@/components/workspace-wrapper';
// Example 4: Using withWorkspace Helper
import { withWorkspace } from '@/components/workspace-wrapper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';

// Example 1: Basic Dashboard Page
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ wsId: string }>;
}) {
  return (
    <WorkspaceWrapper searchParams={searchParams}>
      {({ workspace, wsId }) => (
        <div className="p-6">
          <h1 className="mb-4 text-2xl font-bold">
            {workspace.name || 'Unnamed Workspace'}
          </h1>
          <div className="grid gap-4">
            <div className="rounded bg-gray-100 p-4">
              <h2 className="font-semibold">Workspace Details</h2>
              <p>ID: {wsId}</p>
              <p>Type: {workspace.personal ? 'Personal' : 'Team'}</p>
              <p>Role: {workspace.role}</p>
              <p>Joined: {workspace.joined ? 'Yes' : 'No'}</p>
            </div>
          </div>
        </div>
      )}
    </WorkspaceWrapper>
  );
}

// Example 2: Settings Page with Loading State
export async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ wsId: string }>;
}) {
  return (
    <WorkspaceWrapper
      searchParams={searchParams}
      fallback={<div className="p-6">Loading workspace settings...</div>}
    >
      {async ({ workspace, wsId }) => {
        const { withoutPermission } = await getPermissions({ wsId });

        return (
          <div className="p-6">
            <h1 className="mb-4 text-2xl font-bold">Workspace Settings</h1>

            {withoutPermission('manage_workspace') ? (
              <div className="text-red-600">
                You don't have permission to manage this workspace.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    defaultValue={workspace.name || ''}
                    className="w-full rounded border p-2"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Workspace ID (Read-only)
                  </label>
                  <input
                    type="text"
                    value={wsId}
                    readOnly
                    className="w-full rounded border bg-gray-100 p-2"
                  />
                </div>
              </div>
            )}
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}

// Example 3: Client Component Integration
('use client');

interface WorkspaceCardProps {
  workspace: {
    id: string;
    name: string | null;
    personal: boolean;
    role: string;
    joined: boolean;
  };
  wsId: string;
  onEdit?: () => void;
}

export function WorkspaceCard({ workspace, wsId, onEdit }: WorkspaceCardProps) {
  return (
    <div className="rounded-lg border p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between">
        <h3 className="text-lg font-semibold">
          {workspace.name || 'Unnamed Workspace'}
        </h3>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Edit
          </button>
        )}
      </div>

      <div className="space-y-1 text-sm text-gray-600">
        <p>ID: {wsId}</p>
        <p>Type: {workspace.personal ? 'Personal' : 'Team'}</p>
        <p>Your Role: {workspace.role}</p>
        <p>Status: {workspace.joined ? 'Active' : 'Pending'}</p>
      </div>
    </div>
  );
}

export async function WorkspaceListPage({
  searchParams,
}: {
  searchParams: Promise<{ wsId: string }>;
}) {
  return withWorkspace(
    searchParams,
    WorkspaceCard,
    {
      onEdit: () => console.log('Edit workspace'),
    },
    <div className="p-6">Loading workspace...</div>
  );
}

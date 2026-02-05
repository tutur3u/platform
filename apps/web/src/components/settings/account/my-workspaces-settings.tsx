'use client';

import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Separator } from '@tuturuuu/ui/separator';
import WorkspaceSettingsCard from './workspace-settings-card';

interface Props {
  user: WorkspaceUser;
  workspace?: Workspace | null;
}

export default function MyWorkspacesSettings({ user, workspace }: Props) {
  return (
    <div className="space-y-8">
      {workspace && (
        <>
          <div>
            <h3 className="font-medium text-lg">Current Workspace</h3>
            <p className="mb-4 text-muted-foreground text-sm">
              You are currently viewing settings for{' '}
              <span className="font-medium">
                {workspace.name || 'this workspace'}
              </span>
            </p>
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground text-sm">
                Use the navigation on the left to manage workspace-specific
                settings:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground text-sm">
                <li>
                  <strong>General</strong> - Basic workspace information and
                  settings
                </li>
                <li>
                  <strong>Members</strong> - Manage workspace members and
                  permissions
                </li>
                <li>
                  <strong>Billing</strong> - View and manage workspace
                  subscription
                </li>
              </ul>
            </div>
          </div>
          <Separator />
        </>
      )}

      <WorkspaceSettingsCard user={user} />
    </div>
  );
}

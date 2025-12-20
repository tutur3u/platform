'use client';

import type { Workspace } from '@tuturuuu/types';
import { Separator } from '@tuturuuu/ui/separator';
import WorkspaceAvatarSettings from '@/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/settings/avatar';
import BasicInfo from '@/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/settings/basic-info';

interface GeneralSettingsProps {
  workspace: Workspace;
}

export default function GeneralSettings({ workspace }: GeneralSettingsProps) {
  return (
    <div className="space-y-8">
      <BasicInfo workspace={workspace} allowEdit={true} />
      <Separator />
      <WorkspaceAvatarSettings workspace={workspace} allowEdit={true} />
    </div>
  );
}

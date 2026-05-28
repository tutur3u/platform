'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Separator } from '@tuturuuu/ui/separator';
import LinkedIdentitiesCard from './linked-identities-card';
import SecuritySettingsCard from './security-settings-card';

interface SecuritySettingsProps {
  user: WorkspaceUser;
  linkedProvider?: string;
  onOpenSessions?: () => void;
}

export default function SecuritySettings({
  user,
  linkedProvider,
  onOpenSessions,
}: SecuritySettingsProps) {
  return (
    <div className="space-y-8">
      <SecuritySettingsCard user={user} onOpenSessions={onOpenSessions} />
      <Separator />
      <LinkedIdentitiesCard linkedProvider={linkedProvider} />
    </div>
  );
}

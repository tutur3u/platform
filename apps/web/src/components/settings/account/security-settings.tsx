'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
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
    <SecuritySettingsCard user={user} onOpenSessions={onOpenSessions}>
      <LinkedIdentitiesCard linkedProvider={linkedProvider} />
    </SecuritySettingsCard>
  );
}

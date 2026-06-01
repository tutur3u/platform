'use client';

import { useMemo } from 'react';
import {
  createExternalProjectWorkspaceAccessAdapter,
  createStandardWorkspaceAccessAdapter,
} from './adapters';
import type { WorkspaceAccessPageProps } from './types';
import { WorkspaceAccessPage } from './workspace-access-page';

type Props = Omit<WorkspaceAccessPageProps, 'adapter' | 'mode'>;

export function StandardWorkspaceAccessPage(props: Props) {
  const adapter = useMemo(() => createStandardWorkspaceAccessAdapter(), []);

  return <WorkspaceAccessPage {...props} adapter={adapter} mode="workspace" />;
}

export function ExternalProjectWorkspaceAccessPage(props: Props) {
  const adapter = useMemo(
    () => createExternalProjectWorkspaceAccessAdapter(),
    []
  );

  return <WorkspaceAccessPage {...props} adapter={adapter} mode="cms" />;
}

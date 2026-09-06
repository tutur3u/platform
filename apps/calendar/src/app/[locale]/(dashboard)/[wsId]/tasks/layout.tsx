import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { TaskDialogWrapper } from '@tuturuuu/tasks-ui/tu-do/shared/task-dialog-wrapper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactNode } from 'react';

export default async function TasksLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const user = await getSatelliteAppSessionUser('calendar');
  if (!user) redirect('/login');
  const { wsId } = await params;
  const workspace = await getWorkspace(wsId, { useAdmin: true, user });
  if (!workspace?.joined) notFound();
  return (
    <TaskDialogWrapper
      wsId={workspace.id}
      isPersonalWorkspace={!!workspace.personal}
    >
      {children}
    </TaskDialogWrapper>
  );
}

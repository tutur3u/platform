import type { Workspace, WorkspaceUserRole } from '@tuturuuu/types/db';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense } from 'react';

interface WorkspaceWrapperProps {
  searchParams: Promise<{ wsId: string }>;
  children: (props: {
    workspace: Workspace & { role: WorkspaceUserRole; joined: boolean };
    wsId: string; // The validated UUID from workspace.id
  }) => ReactNode;
  fallback?: ReactNode;
}

/**
 * WorkspaceWrapper component that resolves workspace ID from searchParams
 * and provides a validated workspace object to its children.
 *
 * This wrapper handles the conversion from legacy workspace identifiers:
 * - 'personal' -> resolves to the user's personal workspace UUID
 * - 'internal' -> resolves to ROOT_WORKSPACE_ID
 * - UUID strings -> validates and uses as-is
 *
 * The children function receives:
 * - workspace: The full workspace object with role and joined status
 * - wsId: The validated UUID from workspace.id (not the legacy identifier)
 */
export default async function WorkspaceWrapper({
  searchParams,
  children,
  fallback,
}: WorkspaceWrapperProps) {
  const { wsId } = await searchParams;
  const workspace = await getWorkspace(wsId);

  if (!workspace) {
    notFound();
  }

  // Extract the validated UUID from the workspace object
  const validatedWsId = workspace.id;

  return (
    <Suspense fallback={fallback}>
      {children({ workspace, wsId: validatedWsId })}
    </Suspense>
  );
}

/**
 * Hook-like wrapper for client components that need workspace context
 * This is a server component that can be used to provide workspace data
 * to client components through props.
 */
export async function withWorkspace<T extends Record<string, any>>(
  searchParams: Promise<{ wsId: string }>,
  Component: React.ComponentType<
    T & {
      workspace: Workspace & { role: WorkspaceUserRole; joined: boolean };
      wsId: string;
    }
  >,
  props: T,
  fallback?: ReactNode
) {
  const { wsId } = await searchParams;
  const workspace = await getWorkspace(wsId);

  if (!workspace) {
    notFound();
  }

  const validatedWsId = workspace.id;

  return (
    <Suspense fallback={fallback}>
      <Component {...props} workspace={workspace} wsId={validatedWsId} />
    </Suspense>
  );
}

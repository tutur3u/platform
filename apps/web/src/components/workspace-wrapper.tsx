import type { Workspace, WorkspaceUserRole } from '@tuturuuu/types/db';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense } from 'react';

interface WorkspaceWrapperProps {
  params: Promise<{
    wsId: string;
  }>;
  children: (props: {
    workspace: Workspace & { role: WorkspaceUserRole; joined: boolean };
    wsId: string; // The validated UUID from workspace.id
    isPersonal: boolean;
    isRoot: boolean;
  }) => ReactNode;
  fallback?: ReactNode;
}

/**
 * WorkspaceWrapper component that resolves workspace ID from params
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
  params,
  children,
  fallback,
}: WorkspaceWrapperProps) {
  const { wsId } = await params;
  const workspace = await getWorkspace(wsId);

  if (!workspace) {
    notFound();
  }

  // Extract the validated UUID from the workspace object
  const validatedWsId = workspace.id;

  return (
    <Suspense fallback={fallback}>
      {children({
        workspace,
        wsId: validatedWsId,
        isPersonal: workspace.personal,
        isRoot: workspace.id === ROOT_WORKSPACE_ID,
      })}
    </Suspense>
  );
}

/**
 * Hook-like wrapper for client components that need workspace context
 * This is a server component that can be used to provide workspace data
 * to client components through props.
 */
export async function withWorkspace<T extends Record<string, any>>(
  wsId: string,
  Component: React.ComponentType<
    T & {
      workspace: Workspace & { role: WorkspaceUserRole; joined: boolean };
      wsId: string;
      isPersonal: boolean;
      isRoot: boolean;
    }
  >,
  props: T,
  fallback?: ReactNode
) {
  const workspace = await getWorkspace(wsId);

  if (!workspace) {
    notFound();
  }

  const validatedWsId = workspace.id;

  return (
    <Suspense fallback={fallback}>
      <Component
        {...props}
        workspace={workspace}
        wsId={validatedWsId}
        isPersonal={workspace.personal}
        isRoot={workspace.id === ROOT_WORKSPACE_ID}
      />
    </Suspense>
  );
}

import type { Workspace, WorkspaceProductTier } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense } from 'react';

// Base params that all pages must have
interface BaseParams {
  wsId: string;
}

// Generic interface for workspace wrapper props that preserves additional params
interface WorkspaceWrapperProps<TParams extends BaseParams = BaseParams> {
  params: Promise<TParams>;
  children: (
    props: {
      workspace: Workspace & {
        joined: boolean;
        tier: WorkspaceProductTier | null;
      };
      wsId: string; // The validated UUID from workspace.id
      isPersonal: boolean;
      isRoot: boolean;
      // Spread the additional params to maintain their types
    } & Omit<TParams, 'wsId'>
  ) => ReactNode;
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
 * - workspace: The full workspace object with joined status
 * - wsId: The validated UUID from workspace.id (not the legacy identifier)
 * - All additional params from the original params object (excluding wsId)
 *
 * @template TParams - The type of params object, must extend BaseParams
 */
export default async function WorkspaceWrapper<
  TParams extends BaseParams = BaseParams,
>({ params, children, fallback }: WorkspaceWrapperProps<TParams>) {
  const resolvedParams = await params;
  const { wsId } = resolvedParams;
  const workspace = await getWorkspace(wsId);

  if (!workspace) {
    console.error('Workspace not found:', wsId);
    notFound();
  }

  // Extract the validated UUID from the workspace object
  const validatedWsId = workspace.id;

  // Extract additional params (excluding wsId) to pass to children
  const { wsId: _, ...additionalParams } = resolvedParams;

  return (
    <Suspense fallback={fallback}>
      {children({
        workspace,
        wsId: validatedWsId,
        isPersonal: workspace.personal,
        isRoot: workspace.id === ROOT_WORKSPACE_ID,
        ...additionalParams,
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
      workspace: Workspace & { joined: boolean };
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
    console.error('Workspace not found:', wsId);
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

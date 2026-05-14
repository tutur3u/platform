import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import type { Workspace, WorkspaceProductTier } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';

export interface BaseParams {
  wsId: string;
}

export interface WorkspaceWrapperProps<
  TParams extends BaseParams = BaseParams,
> {
  params: Promise<TParams>;
  children: (
    props: {
      workspace: Workspace & {
        joined: boolean;
        tier: WorkspaceProductTier | null;
      };
      wsId: string;
      isPersonal: boolean;
      isRoot: boolean;
    } & Omit<TParams, 'wsId'>
  ) => ReactNode | Promise<ReactNode>;
  fallback?: ReactNode;
}

export default async function WorkspaceWrapper<
  TParams extends BaseParams = BaseParams,
>({ params, children, fallback }: WorkspaceWrapperProps<TParams>) {
  const resolvedParams = await params;
  const { wsId } = resolvedParams;
  const user = await getSatelliteAppSessionUser('track');
  const workspace = user
    ? await getWorkspace(wsId, { useAdmin: true, user })
    : null;

  if (!workspace) {
    notFound();
  }

  const { wsId: _, ...additionalParams } = resolvedParams;

  const childContent = await children({
    workspace,
    wsId: workspace.id,
    isPersonal: workspace.personal,
    isRoot: workspace.id === ROOT_WORKSPACE_ID,
    ...additionalParams,
  } as {
    workspace: Workspace & {
      joined: boolean;
      tier: WorkspaceProductTier | null;
    };
    wsId: string;
    isPersonal: boolean;
    isRoot: boolean;
  } & Omit<TParams, 'wsId'>);

  return <Suspense fallback={fallback}>{childContent}</Suspense>;
}

export async function withWorkspace<T extends Record<string, unknown>>(
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
  const user = await getSatelliteAppSessionUser('track');
  const workspace = user
    ? await getWorkspace(wsId, { useAdmin: true, user })
    : null;

  if (!workspace) {
    notFound();
  }

  return (
    <Suspense fallback={fallback}>
      <Component
        {...props}
        workspace={workspace}
        wsId={workspace.id}
        isPersonal={workspace.personal}
        isRoot={workspace.id === ROOT_WORKSPACE_ID}
      />
    </Suspense>
  );
}

import type { Workspace, WorkspaceProductTier } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { notFound } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import { getFormsWorkspace } from '@/lib/workspace';

interface BaseParams {
  wsId: string;
}

interface WorkspaceWrapperProps<TParams extends BaseParams = BaseParams> {
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

/**
 * Forms-local drop-in for the shared `@tuturuuu/ui` workspace wrapper.
 *
 * Identical API and behavior, except the workspace is resolved through
 * `getFormsWorkspace`, which threads the Tuturuuu app-session user into
 * `getWorkspace`. The shared wrapper calls `getWorkspace(wsId)` with no user,
 * which falls back to a cookie-backed Supabase client — anonymous on a
 * satellite domain — so every page using it would 404 in production.
 *
 * Satellites must not use the shared wrapper. See `src/lib/workspace.ts`.
 */
export default async function WorkspaceWrapper<
  TParams extends BaseParams = BaseParams,
>({ params, children, fallback }: WorkspaceWrapperProps<TParams>) {
  const resolvedParams = await params;
  const { wsId } = resolvedParams;
  const workspace = await getFormsWorkspace(wsId);

  if (!workspace) {
    console.error('Workspace not found:', wsId);
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

export type { BaseParams, WorkspaceWrapperProps };

import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeRouteWorkspaceId } from '../../route-auth';
import { canManageProjects, jsonError } from '../access';
import { importRequestSchema } from '../schemas';
import { runGithubImport } from './run';
import { createSupabaseImportStore, type ImportStore } from './store';

export type GithubImportAuthContext = {
  appSession?: boolean;
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
};

export type GithubImportDeps = {
  createStore?: (admin: TypedSupabaseClient) => ImportStore;
  getAdmin?: () => Promise<TypedSupabaseClient>;
  hasPermission?: (user: SupabaseUser, wsId: string) => Promise<boolean>;
  resolveWorkspaceId?: (args: {
    appSession: boolean;
    supabase: TypedSupabaseClient;
    userId: string;
    wsId: string;
  }) => Promise<string>;
};

/**
 * POST .../tasks/import/github: imports a batch of normalized GitHub issues
 * into one board. Needs manage_projects in the workspace; workspace creators
 * (personal workspaces included) hold it implicitly.
 *
 * The importer is idempotent on the issue URL and only touches tasks that
 * carry its own external reference. It never writes credentials: the CLI
 * fetches GitHub with the caller's local token and sends issue data only.
 */
export async function handleGithubImportPOST(
  request: NextRequest,
  context: { params: Promise<{ wsId: string }> },
  auth: GithubImportAuthContext,
  deps: GithubImportDeps = {}
) {
  try {
    const { wsId: rawWsId } = await context.params;
    const wsId = await (deps.resolveWorkspaceId ?? normalizeRouteWorkspaceId)({
      appSession: auth.appSession === true,
      supabase: auth.supabase,
      userId: auth.user.id,
      wsId: rawWsId,
    });

    const allowed = await (deps.hasPermission ?? canManageProjects)(
      auth.user,
      wsId
    );
    if (!allowed) return jsonError('Workspace access denied', 403);

    const input = importRequestSchema.parse(await request.json());
    const admin = await (
      deps.getAdmin ??
      (() => createAdminClient() as Promise<TypedSupabaseClient>)
    )();
    const store = (deps.createStore ?? createSupabaseImportStore)(admin);

    // A board id from another workspace is a 404, never an import target.
    const loaded = await store.loadBoard(input.board_id, wsId);
    if (!loaded) return jsonError('Board not found', 404);

    const results = await runGithubImport(store, {
      actorId: auth.user.id,
      board: loaded.board,
      dryRun: input.dry_run,
      refreshContent: input.refresh_content,
      issues: input.issues,
      lists: loaded.lists,
      mapping: input.mapping,
      wsId,
    });
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error in GitHub import:', error);
    return jsonError('Internal server error', 500);
  }
}

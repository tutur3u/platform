import { requireEducationWorkspaceAccess } from '@tuturuuu/education-core/education/access';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import type { SessionAuthContext } from './api-auth';

export type WorkspaceScopeCheck = 'ok' | 'not_found' | 'error';

/**
 * Confirms a quiz set belongs to the workspace before any admin-client read or
 * write keyed by `setId`. Link tables carry no workspace column, so this check
 * is the only workspace boundary for them.
 */
export async function checkWorkspaceQuizSet(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  setId: string
): Promise<WorkspaceScopeCheck> {
  const { data, error } = await sbAdmin
    .from('workspace_quiz_sets')
    .select('id')
    .eq('id', setId)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (error) return 'error';
  return data ? 'ok' : 'not_found';
}

/**
 * Confirms every module belongs to the workspace through its course group
 * (`workspace_course_modules.group_id` -> `workspace_user_groups.ws_id`).
 */
export async function checkWorkspaceModules(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  moduleIds: string[]
): Promise<WorkspaceScopeCheck> {
  const uniqueIds = [...new Set(moduleIds)];
  if (uniqueIds.length === 0) return 'ok';

  const { data: modules, error: modulesError } = await sbAdmin
    .from('workspace_course_modules')
    .select('id, group_id')
    .in('id', uniqueIds);
  if (modulesError) return 'error';
  if (modules?.length !== uniqueIds.length) return 'not_found';

  const groupIds = [...new Set(modules.map((module) => module.group_id))];
  const { data: groups, error: groupsError } = await sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .in('id', groupIds)
    .eq('ws_id', wsId);
  if (groupsError) return 'error';
  return groups?.length === groupIds.length ? 'ok' : 'not_found';
}

export async function requireWorkspaceQuizSet(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  setId: string
) {
  const result = await checkWorkspaceQuizSet(sbAdmin, wsId, setId);
  if (result === 'error') {
    return NextResponse.json(
      { message: 'Failed to validate quiz set' },
      { status: 500 }
    );
  }
  if (result === 'not_found') {
    return NextResponse.json(
      { message: 'Quiz set not found' },
      { status: 404 }
    );
  }
  return null;
}

export async function requireWorkspaceModules(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  moduleIds: string[]
) {
  const result = await checkWorkspaceModules(sbAdmin, wsId, moduleIds);
  if (result === 'error') {
    return NextResponse.json(
      { message: 'Failed to validate modules' },
      { status: 500 }
    );
  }
  if (result === 'not_found') {
    return NextResponse.json({ message: 'Module not found' }, { status: 404 });
  }
  return null;
}

export async function requireQuizModuleAccess(
  context: SessionAuthContext,
  wsId: string,
  setId: string,
  moduleIds: string[]
) {
  const access = await requireEducationWorkspaceAccess({ context, wsId });
  if (access instanceof NextResponse) return access;

  const setFailure = await requireWorkspaceQuizSet(
    access.sbAdmin,
    access.normalizedWsId,
    setId
  );
  if (setFailure) return setFailure;

  const moduleFailure = await requireWorkspaceModules(
    access.sbAdmin,
    access.normalizedWsId,
    moduleIds
  );
  if (moduleFailure) return moduleFailure;

  return access;
}

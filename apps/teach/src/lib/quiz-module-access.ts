import { requireEducationWorkspaceAccess } from '@tuturuuu/education-core/education/access';
import { NextResponse } from 'next/server';
import type { SessionAuthContext } from './api-auth';

export async function requireQuizModuleAccess(
  context: SessionAuthContext,
  wsId: string,
  setId: string,
  moduleIds: string[]
) {
  const access = await requireEducationWorkspaceAccess({ context, wsId });
  if (access instanceof NextResponse) return access;

  const { data: quizSet, error: setError } = await access.sbAdmin
    .from('workspace_quiz_sets')
    .select('id')
    .eq('id', setId)
    .eq('ws_id', access.normalizedWsId)
    .maybeSingle();
  if (setError) {
    return NextResponse.json(
      { message: 'Failed to validate quiz set' },
      { status: 500 }
    );
  }
  if (!quizSet) {
    return NextResponse.json(
      { message: 'Quiz set not found' },
      { status: 404 }
    );
  }

  const uniqueIds = [...new Set(moduleIds)];
  const { data: modules, error: modulesError } = await access.sbAdmin
    .from('workspace_course_modules')
    .select('id, group_id')
    .in('id', uniqueIds);
  if (modulesError) {
    return NextResponse.json(
      { message: 'Failed to validate modules' },
      { status: 500 }
    );
  }
  if (modules?.length !== uniqueIds.length) {
    return NextResponse.json({ message: 'Module not found' }, { status: 404 });
  }

  const groupIds = [...new Set(modules.map((module) => module.group_id))];
  const { data: groups, error: groupsError } = await access.sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .in('id', groupIds)
    .eq('ws_id', access.normalizedWsId);
  if (groupsError) {
    return NextResponse.json(
      { message: 'Failed to validate module workspace' },
      { status: 500 }
    );
  }
  if (groups?.length !== groupIds.length) {
    return NextResponse.json({ message: 'Module not found' }, { status: 404 });
  }

  return access;
}

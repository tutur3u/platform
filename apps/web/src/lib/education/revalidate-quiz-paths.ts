import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { revalidatePath } from 'next/cache';
import { defaultLocale, supportedLocales } from '@/i18n/routing';

type ModuleCourseRow = {
  group_id: string | null;
  id: string;
};

type QuizModuleLinkRow = {
  module_id: string | null;
  workspace_course_modules: ModuleCourseRow | ModuleCourseRow[] | null;
};

function firstOf<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function localizedPaths(path: string) {
  const paths = new Set<string>([path]);

  for (const locale of supportedLocales) {
    if (locale !== defaultLocale) paths.add(`/${locale}${path}`);
  }

  return [...paths];
}

function revalidateModuleQuizPaths({
  courseId,
  moduleId,
  wsId,
}: {
  courseId: string;
  moduleId: string;
  wsId: string;
}) {
  const modulePath = `/${wsId}/education/courses/${courseId}/modules/${moduleId}`;

  for (const path of localizedPaths(modulePath)) {
    revalidatePath(path, 'layout');
    revalidatePath(`${path}/quizzes`);
  }
}

export async function revalidateCourseModuleQuizPaths({
  db,
  moduleIds,
  wsId,
}: {
  db: TypedSupabaseClient;
  moduleIds: string[];
  wsId: string;
}) {
  if (moduleIds.length === 0) return;

  const { data, error } = await db
    .from('workspace_course_modules')
    .select('id, group_id')
    .in('id', [...new Set(moduleIds)]);

  if (error) {
    console.warn('Failed to revalidate quiz module paths', {
      error,
      moduleIds,
      wsId,
    });
    return;
  }

  for (const row of (data ?? []) as ModuleCourseRow[]) {
    if (!row.group_id) {
      console.warn('Skipping quiz path revalidation for orphaned module', {
        moduleId: row.id,
        wsId,
      });
      continue;
    }
    revalidateModuleQuizPaths({
      courseId: row.group_id,
      moduleId: row.id,
      wsId,
    });
  }
}

export async function revalidateQuizLinkedModulePaths({
  db,
  quizId,
  wsId,
}: {
  db: TypedSupabaseClient;
  quizId: string;
  wsId: string;
}) {
  const { data, error } = await db
    .from('course_module_quizzes')
    .select('module_id, workspace_course_modules(id, group_id)')
    .eq('quiz_id', quizId);

  if (error) {
    console.warn('Failed to look up quiz module paths for revalidation', {
      error,
      quizId,
      wsId,
    });
    return;
  }

  for (const row of (data ?? []) as QuizModuleLinkRow[]) {
    const module = firstOf(row.workspace_course_modules);
    const moduleId = row.module_id ?? module?.id;
    if (!module?.group_id || !moduleId) continue;
    revalidateModuleQuizPaths({
      courseId: module.group_id,
      moduleId,
      wsId,
    });
  }
}

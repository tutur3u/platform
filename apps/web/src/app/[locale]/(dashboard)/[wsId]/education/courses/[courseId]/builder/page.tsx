import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';
import { CourseBuilderClient } from './course-builder-client';

export const metadata: Metadata = {
  title: 'Course Builder',
  description:
    'Build and publish course modules with guided teacher workflows.',
};

interface Props {
  params: Promise<{
    courseId: string;
    wsId: string;
  }>;
}

interface BuilderModule {
  content: unknown;
  course_id: string;
  created_at: string;
  extra_content: unknown;
  flashcard_count: number;
  id: string;
  is_public: boolean;
  is_published: boolean;
  name: string;
  quiz_count: number;
  quiz_set_count: number;
  sort_key: number | null;
  youtube_links: string[] | null;
}

export default async function CourseBuilderPage({ params }: Props) {
  const { wsId: routeWsId, courseId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(routeWsId);
  const sbAdmin = await createAdminClient();

  const { data: course, error: courseError } = await sbAdmin
    .from('workspace_courses')
    .select('*')
    .eq('ws_id', resolvedWsId)
    .eq('id', courseId)
    .maybeSingle();

  if (courseError) throw courseError;
  if (!course) notFound();

  const { data: modules, error: modulesError } = await sbAdmin
    .from('workspace_course_modules')
    .select('*')
    .eq('course_id', courseId)
    .order('sort_key', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (modulesError) throw modulesError;

  const [quizzesResponse, flashcardsResponse, quizSetsResponse] =
    await Promise.all([
      sbAdmin.from('course_module_quizzes').select('module_id'),
      sbAdmin.from('course_module_flashcards').select('module_id'),
      sbAdmin.from('course_module_quiz_sets').select('module_id'),
    ]);

  if (quizzesResponse.error) throw quizzesResponse.error;
  if (flashcardsResponse.error) throw flashcardsResponse.error;
  if (quizSetsResponse.error) throw quizSetsResponse.error;

  const quizCountByModuleId = new Map<string, number>();
  for (const row of quizzesResponse.data ?? []) {
    quizCountByModuleId.set(
      row.module_id,
      (quizCountByModuleId.get(row.module_id) ?? 0) + 1
    );
  }

  const flashcardCountByModuleId = new Map<string, number>();
  for (const row of flashcardsResponse.data ?? []) {
    flashcardCountByModuleId.set(
      row.module_id,
      (flashcardCountByModuleId.get(row.module_id) ?? 0) + 1
    );
  }

  const quizSetCountByModuleId = new Map<string, number>();
  for (const row of quizSetsResponse.data ?? []) {
    quizSetCountByModuleId.set(
      row.module_id,
      (quizSetCountByModuleId.get(row.module_id) ?? 0) + 1
    );
  }

  const builderModules: BuilderModule[] = (modules ?? []).map((module) => ({
    content: module.content,
    course_id: module.course_id,
    created_at: module.created_at,
    extra_content: module.extra_content,
    flashcard_count: flashcardCountByModuleId.get(module.id) ?? 0,
    id: module.id,
    is_public: module.is_public,
    is_published: module.is_published,
    name: module.name,
    quiz_count: quizCountByModuleId.get(module.id) ?? 0,
    quiz_set_count: quizSetCountByModuleId.get(module.id) ?? 0,
    sort_key:
      typeof (module as { sort_key?: number | null }).sort_key === 'number'
        ? ((module as { sort_key?: number | null }).sort_key ?? null)
        : null,
    youtube_links: module.youtube_links,
  }));

  return (
    <CourseBuilderClient
      course={course}
      courseId={courseId}
      modules={builderModules}
      resolvedWsId={resolvedWsId}
      routeWsId={routeWsId}
    />
  );
}

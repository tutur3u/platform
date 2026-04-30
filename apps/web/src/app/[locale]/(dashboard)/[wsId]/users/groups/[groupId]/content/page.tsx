import { HardDrive } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceCourseBuilderModule } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@tuturuuu/ui/sheet';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';
import { CourseBuilderClient } from '../../../../education/courses/[courseId]/builder/course-builder-client';
import GroupStorage from '../group-storage';

export const metadata: Metadata = {
  title: 'Group Content Builder',
  description: 'Build and publish course modules within your user group.',
};

interface Props {
  params: Promise<{
    groupId: string;
    wsId: string;
  }>;
}

export default async function GroupContentPage({ params }: Props) {
  const { wsId: routeWsId, groupId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(routeWsId);
  const permissions = await getPermissions({ wsId: resolvedWsId });
  if (!permissions?.containsPermission('manage_users')) {
    notFound();
  }

  const canUpdateUserGroups =
    permissions.containsPermission('update_user_groups');
  const t = await getTranslations();

  const sbAdmin = await createAdminClient();

  const { data: group, error: groupError } = await sbAdmin
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', resolvedWsId)
    .eq('id', groupId)
    .maybeSingle();

  if (groupError) throw groupError;
  if (!group) notFound();

  const { data: modules, error: modulesError } = await sbAdmin
    .from('workspace_course_modules')
    .select('*')
    .eq('group_id', groupId)
    .order('sort_key', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (modulesError) throw modulesError;

  const moduleIds = (modules ?? []).map((module) => module.id);
  const [quizzesResponse, flashcardsResponse, quizSetsResponse] =
    moduleIds.length > 0
      ? await Promise.all([
          sbAdmin
            .from('course_module_quizzes')
            .select('module_id')
            .in('module_id', moduleIds),
          sbAdmin
            .from('course_module_flashcards')
            .select('module_id')
            .in('module_id', moduleIds),
          sbAdmin
            .from('course_module_quiz_sets')
            .select('module_id')
            .in('module_id', moduleIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];

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

  const builderModules: WorkspaceCourseBuilderModule[] = (modules ?? []).map(
    (module) => ({
      content: module.content,
      group_id: groupId, // Using groupId as group_id for the builder
      created_at: module.created_at,
      extra_content: module.extra_content,
      flashcard_count: flashcardCountByModuleId.get(module.id) ?? 0,
      id: module.id,
      is_public: module.is_public,
      is_published: module.is_published,
      name: module.name,
      quiz_count: quizCountByModuleId.get(module.id) ?? 0,
      quiz_set_count: quizSetCountByModuleId.get(module.id) ?? 0,
      sort_key: module.sort_key ?? null,
      youtube_links: module.youtube_links,
    })
  );

  return (
    <CourseBuilderClient
      course={group}
      courseId={groupId}
      modules={builderModules}
      resolvedWsId={resolvedWsId}
      routeWsId={routeWsId}
      backHref={`/${routeWsId}/users/groups/${groupId}`}
      backLabel={t('common.back')}
      extraHeaderActions={
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-11 rounded-2xl px-4">
              <HardDrive className="mr-2 h-4 w-4" />
              {t('ws-user-group-details.storage') || 'Storage'}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
            <SheetHeader className="mb-6">
              <SheetTitle>
                {t('ws-user-group-details.storage') || 'Storage'}
              </SheetTitle>
            </SheetHeader>
            <GroupStorage
              wsId={resolvedWsId}
              groupId={groupId}
              canUpdateGroup={canUpdateUserGroups}
            />
          </SheetContent>
        </Sheet>
      }
    />
  );
}

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SharedCourseGroup, SharedCourseModule } from '@tuturuuu/types';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { validate as validateUuid } from 'uuid';

interface SharedCourseContent {
  group: SharedCourseGroup;
  modules: SharedCourseModule[];
}

function toRichTextContent(value: unknown): JSONContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as JSONContent;
}

export async function loadSharedCourseContent(
  groupId: string,
  request?: Request
): Promise<SharedCourseContent | null> {
  if (!validateUuid(groupId)) {
    return null;
  }

  const sessionSupabase = request
    ? await createClient(request)
    : await createClient();
  const { user, authError: userError } =
    await resolveAuthenticatedSessionUser(sessionSupabase);

  if (userError) throw userError;
  if (!user) return null;

  const sbAdmin = await createAdminClient();
  const { data: group, error: groupError } = await sbAdmin
    .from('workspace_user_groups')
    .select('id, ws_id, name, description')
    .eq('id', groupId)
    .maybeSingle();

  if (groupError) throw groupError;
  if (!group) return null;

  const { data: membership, error: membershipError } = await sbAdmin
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', group.ws_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) throw membershipError;

  let hasAccess = Boolean(membership);

  if (!hasAccess) {
    const { data: guest, error: guestError } = await sbAdmin
      .from('workspace_guests')
      .select('id')
      .eq('ws_id', group.ws_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (guestError) throw guestError;

    if (guest) {
      const { data: permissions, error: permissionError } = await sbAdmin
        .from('workspace_guest_permissions')
        .select('enable, resource_id')
        .eq('guest_id', guest.id)
        .eq('permission', 'course:view')
        .or(`resource_id.is.null,resource_id.eq.${groupId}`);

      if (permissionError) throw permissionError;

      hasAccess = (permissions ?? []).some((permission) => permission.enable);
    }
  }

  if (!hasAccess) return null;

  const { data: modules, error: modulesError } = await sbAdmin
    .from('workspace_course_modules')
    .select(
      'id, name, content, extra_content, youtube_links, group_id, created_at, is_public, is_published, sort_key'
    )
    .eq('group_id', groupId)
    .eq('is_published', true)
    .order('sort_key', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (modulesError) throw modulesError;

  const publishedModules = modules ?? [];
  const moduleIds = publishedModules.map((module) => module.id);

  const [quizzesRes, flashcardsRes, quizSetsRes] =
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

  if (quizzesRes.error) throw quizzesRes.error;
  if (flashcardsRes.error) throw flashcardsRes.error;
  if (quizSetsRes.error) throw quizSetsRes.error;

  const quizCount = new Map<string, number>();
  for (const row of quizzesRes.data ?? []) {
    quizCount.set(row.module_id, (quizCount.get(row.module_id) ?? 0) + 1);
  }

  const flashcardCount = new Map<string, number>();
  for (const row of flashcardsRes.data ?? []) {
    flashcardCount.set(
      row.module_id,
      (flashcardCount.get(row.module_id) ?? 0) + 1
    );
  }

  const quizSetCount = new Map<string, number>();
  for (const row of quizSetsRes.data ?? []) {
    quizSetCount.set(row.module_id, (quizSetCount.get(row.module_id) ?? 0) + 1);
  }

  return {
    group: {
      description: group.description,
      name: group.name,
    },
    modules: publishedModules.map((module) => ({
      ...module,
      content: toRichTextContent(module.content),
      flashcards: flashcardCount.get(module.id) ?? 0,
      quizzes: quizCount.get(module.id) ?? 0,
      quizSets: quizSetCount.get(module.id) ?? 0,
    })),
  };
}

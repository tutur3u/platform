import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const DetailQuerySchema = z.object({
  courseId: z.guid(),
});

const ListQuerySchema = z.object({
  wsId: z.guid(),
});

function toRichTextContent(value: unknown): JSONContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JSONContent;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Authenticate caller
    const sessionSupabase = await createClient(request);
    const { user, authError } =
      await resolveAuthenticatedSessionUser(sessionSupabase);

    if (authError) {
      return NextResponse.json(
        { error: 'Authentication error' },
        { status: 401 }
      );
    }
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const courseId = searchParams.get('courseId');
    const wsId = searchParams.get('wsId');

    // If courseId is provided, return detailed content for a single course
    if (courseId) {
      return handleCourseDetail(courseId, user.id);
    }

    // If wsId is provided, return list of courses for the workspace
    if (wsId) {
      return handleCourseList(wsId, user.id);
    }

    return NextResponse.json(
      { error: 'Provide either courseId or wsId query param' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Failed to load course content', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// ─── List all courses for a workspace ────────────────────────────────────────

async function handleCourseList(wsId: string, userId: string) {
  const parsed = ListQuerySchema.safeParse({ wsId });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid wsId', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();

  // Verify workspace membership
  const { data: membership, error: membershipError } = await sbAdmin
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError) throw membershipError;

  let hasAccess = Boolean(membership);

  if (!hasAccess) {
    const { data: guest, error: guestError } = await sbAdmin
      .from('workspace_guests')
      .select('id')
      .eq('ws_id', wsId)
      .eq('user_id', userId)
      .maybeSingle();

    if (guestError) throw guestError;
    if (guest) hasAccess = true;
  }

  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get all user groups that have published course modules (i.e. are courses)
  const { data: modules, error: modulesError } = await sbAdmin
    .from('workspace_course_modules')
    .select('id, group_id')
    .eq('is_published', true);

  if (modulesError) throw modulesError;

  const courseGroupIds = [...new Set((modules ?? []).map((m) => m.group_id))];

  if (!courseGroupIds.length) {
    return NextResponse.json({ courses: [] });
  }

  // Fetch the groups that belong to this workspace
  const { data: groups, error: groupsError } = await sbAdmin
    .from('workspace_user_groups')
    .select('id, name, description')
    .eq('ws_id', wsId)
    .in('id', courseGroupIds)
    .order('name', { ascending: true });

  if (groupsError) throw groupsError;

  // Count modules per course
  const moduleCountByCourse = new Map<string, number>();
  for (const mod of modules ?? []) {
    if (courseGroupIds.includes(mod.group_id)) {
      moduleCountByCourse.set(
        mod.group_id,
        (moduleCountByCourse.get(mod.group_id) ?? 0) + 1
      );
    }
  }

  // Get completion status for this user
  const allModuleIds = (modules ?? []).map((m) => m.id);
  const { data: completions, error: completionsError } =
    allModuleIds.length > 0
      ? await sbAdmin
          .from('course_module_completion_status')
          .select('module_id')
          .eq('user_id', userId)
          .eq('completion_status', true)
          .in('module_id', allModuleIds)
      : { data: [], error: null };

  if (completionsError) throw completionsError;

  const completedModuleIds = new Set(
    (completions ?? []).map((r) => r.module_id)
  );

  // Build module-to-course mapping for completion counting
  const moduleToCourse = new Map<string, string>();
  for (const mod of modules ?? []) {
    moduleToCourse.set(mod.id, mod.group_id);
  }

  const completedByCourse = new Map<string, number>();
  for (const moduleId of completedModuleIds) {
    const courseId = moduleToCourse.get(moduleId);
    if (courseId) {
      completedByCourse.set(
        courseId,
        (completedByCourse.get(courseId) ?? 0) + 1
      );
    }
  }

  const courses = (groups ?? []).map((group) => {
    const totalModules = moduleCountByCourse.get(group.id) ?? 0;
    const completedModules = completedByCourse.get(group.id) ?? 0;
    const progress = totalModules
      ? Math.round((completedModules / totalModules) * 100)
      : 0;

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      totalModules,
      completedModules,
      progress,
    };
  });

  return NextResponse.json({ courses });
}

// ─── Get detailed content for a single course ────────────────────────────────

async function handleCourseDetail(courseId: string, userId: string) {
  const parsed = DetailQuerySchema.safeParse({ courseId });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid courseId', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const groupId = parsed.data.courseId;
  const sbAdmin = await createAdminClient();

  // Fetch the course group
  const { data: group, error: groupError } = await sbAdmin
    .from('workspace_user_groups')
    .select('id, ws_id, name, description')
    .eq('id', groupId)
    .maybeSingle();

  if (groupError) throw groupError;
  if (!group) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }

  // Check workspace membership
  const { data: membership, error: membershipError } = await sbAdmin
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', group.ws_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError) throw membershipError;

  let hasAccess = Boolean(membership);

  // Fallback: check guest permissions
  if (!hasAccess) {
    const { data: guest, error: guestError } = await sbAdmin
      .from('workspace_guests')
      .select('id')
      .eq('ws_id', group.ws_id)
      .eq('user_id', userId)
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

      hasAccess = (permissions ?? []).some((p) => p.enable);
    }
  }

  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch published modules
  const { data: modulesData, error: modulesError } = await sbAdmin
    .from('workspace_course_modules')
    .select(
      'id, name, content, extra_content, youtube_links, group_id, created_at, is_public, is_published, sort_key'
    )
    .eq('group_id', groupId)
    .eq('is_published', true)
    .order('sort_key', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (modulesError) throw modulesError;

  const publishedModules = modulesData ?? [];
  const moduleIds = publishedModules.map((m) => m.id);

  // Fetch quiz/flashcard/quiz-set counts
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
    quizSetCount.set(
      row.module_id,
      (quizSetCount.get(row.module_id) ?? 0) + 1
    );
  }

  return NextResponse.json({
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
  });
}

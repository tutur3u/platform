import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import {
  getLearnerCourseDetail,
  getLearnerCourseSummaries,
  resolveStudentForPlatformUser,
  resolveTulearnSubject,
  tulearnAccessErrorResponse,
} from '@/lib/tulearn/service';

const DetailQuerySchema = z.object({
  courseId: z.guid(),
  studentId: z.guid().optional(),
});

const ListQuerySchema = z.object({
  studentId: z.guid().optional(),
  wsId: z.string().min(1),
});

class CourseRouteError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 500,
    cause?: unknown
  ) {
    super(message);
    this.cause = cause;
    this.name = 'CourseRouteError';
  }
}

function courseRouteError(code: string, cause: unknown) {
  return new CourseRouteError(
    'Failed to load course content',
    code,
    500,
    cause
  );
}

function toRichTextContent(value: unknown): JSONContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  if (
    !('type' in value) ||
    value.type !== 'doc' ||
    ('content' in value && !Array.isArray(value.content))
  ) {
    return null;
  }
  return value as JSONContent;
}

type LearnerCourseDetail = NonNullable<
  Awaited<ReturnType<typeof getLearnerCourseDetail>>
>;

export async function GET(request: Request) {
  await connection();

  try {
    const { searchParams } = new URL(request.url);

    // Authenticate caller
    let sessionSupabase = await createClient(request);
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: true,
    });
    if (!auth.ok) return auth.response;
    const { user } = auth;
    sessionSupabase = auth.supabase;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const courseId = searchParams.get('courseId');
    const wsId = searchParams.get('wsId');
    const studentId = searchParams.get('studentId') ?? undefined;

    // If courseId is provided, return detailed content for a single course
    if (courseId) {
      return await handleCourseDetail({
        courseId,
        sessionSupabase,
        studentId,
        user,
      });
    }

    // If wsId is provided, return list of courses for the workspace
    if (wsId) {
      return await handleCourseList({
        sessionSupabase,
        studentId,
        user,
        wsId,
      });
    }

    return NextResponse.json(
      { error: 'Provide either courseId or wsId query param' },
      { status: 400 }
    );
  } catch (error) {
    const tulearnErrorResponse = tulearnAccessErrorResponse(error);
    if (tulearnErrorResponse) return tulearnErrorResponse;

    if (error instanceof CourseRouteError) {
      console.error('Failed to load course content', {
        code: error.code,
        error,
      });
      return NextResponse.json(
        { code: error.code, error: error.message },
        { status: error.status }
      );
    }
    console.error('Failed to load course content', { error });
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// ─── List all courses for a workspace ────────────────────────────────────────

async function handleCourseList({
  sessionSupabase,
  studentId,
  user,
  wsId,
}: {
  sessionSupabase: TypedSupabaseClient;
  studentId?: string;
  user: SupabaseUser;
  wsId: string;
}) {
  const parsed = ListQuerySchema.safeParse({ studentId, wsId });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid wsId', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const subject = await resolveTulearnSubject({
    requestSupabase: sessionSupabase,
    studentId: parsed.data.studentId,
    user,
    wsId: parsed.data.wsId,
  });
  const sbAdmin = await createAdminClient();

  const courses = await getLearnerCourseSummaries({
    db: sbAdmin,
    studentPlatformUserId: subject.studentPlatformUserId,
    studentWorkspaceUserId: subject.studentWorkspaceUserId,
    wsId: subject.wsId,
  });

  return NextResponse.json({ courses });
}

// ─── Get detailed content for a single course ────────────────────────────────

async function handleCourseDetail({
  courseId,
  sessionSupabase,
  studentId,
  user,
}: {
  courseId: string;
  sessionSupabase: TypedSupabaseClient;
  studentId?: string;
  user: SupabaseUser;
}) {
  const parsed = DetailQuerySchema.safeParse({ courseId, studentId });
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
    .eq('is_course_published', true)
    .maybeSingle();

  if (groupError)
    throw courseRouteError('course_group_lookup_failed', groupError);
  if (!group) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }

  let hasAccess = false;
  let learnerCourseDetail: LearnerCourseDetail | null = null;

  if (parsed.data.studentId) {
    const subject = await resolveTulearnSubject({
      requestSupabase: sessionSupabase,
      studentId: parsed.data.studentId,
      user,
      wsId: group.ws_id,
    });
    const course = await getLearnerCourseDetail({
      courseId: groupId,
      db: sbAdmin,
      studentPlatformUserId: subject.studentPlatformUserId,
      studentWorkspaceUserId: subject.studentWorkspaceUserId,
      wsId: subject.wsId,
    });
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    learnerCourseDetail = course;
    hasAccess = true;
  }

  if (!hasAccess) {
    const selfStudent = await resolveStudentForPlatformUser({
      db: sbAdmin,
      platformUserId: user.id,
      wsId: group.ws_id,
    });

    if (selfStudent) {
      const course = await getLearnerCourseDetail({
        courseId: groupId,
        db: sbAdmin,
        studentPlatformUserId: user.id,
        studentWorkspaceUserId: selfStudent.workspace_user_id,
        wsId: group.ws_id,
      });
      if (!course) {
        return NextResponse.json(
          { error: 'Course not found' },
          { status: 404 }
        );
      }
      learnerCourseDetail = course;
      hasAccess = true;
    }
  }

  // Fallback: check explicit guest course permissions.
  if (!hasAccess) {
    const { data: guest, error: guestError } = await sessionSupabase
      .from('workspace_guests')
      .select('id')
      .eq('ws_id', group.ws_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (guestError) {
      throw courseRouteError('workspace_guest_lookup_failed', guestError);
    }

    if (guest) {
      const { data: permissions, error: permissionError } =
        await sessionSupabase
          .from('workspace_guest_permissions')
          .select('enable, resource_id')
          .eq('guest_id', guest.id)
          .eq('permission', 'course:view')
          .or(`resource_id.is.null,resource_id.eq.${groupId}`);

      if (permissionError) {
        throw courseRouteError(
          'workspace_guest_permission_lookup_failed',
          permissionError
        );
      }

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
      'id, name, content, extra_content, youtube_links, group_id, module_group_id, created_at, is_public, is_published, sort_key'
    )
    .eq('group_id', groupId)
    .eq('is_published', true)
    .order('sort_key', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (modulesError) {
    throw courseRouteError('course_modules_lookup_failed', modulesError);
  }

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

  if (quizzesRes.error) {
    throw courseRouteError('course_quizzes_lookup_failed', quizzesRes.error);
  }
  if (flashcardsRes.error) {
    throw courseRouteError(
      'course_flashcards_lookup_failed',
      flashcardsRes.error
    );
  }
  if (quizSetsRes.error) {
    throw courseRouteError('course_quiz_sets_lookup_failed', quizSetsRes.error);
  }

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

  const learnerModuleAccess = new Map(
    learnerCourseDetail?.modules.map((module) => [module.id, module]) ?? []
  );

  return NextResponse.json({
    group: {
      description: group.description,
      name: group.name,
    },
    modules: publishedModules.map((module) => {
      const learnerModule = learnerModuleAccess.get(module.id);
      const locked = learnerModule?.locked === true;

      return {
        ...module,
        completed: learnerModule?.completed,
        content: locked ? null : toRichTextContent(module.content),
        extra_content: locked ? null : module.extra_content,
        flashcards:
          learnerModule?.counts.flashcards ??
          flashcardCount.get(module.id) ??
          0,
        locked: learnerModule?.locked,
        quizzes: learnerModule?.counts.quizzes ?? quizCount.get(module.id) ?? 0,
        quizSets:
          learnerModule?.counts.quizSets ?? quizSetCount.get(module.id) ?? 0,
        youtube_links: locked ? null : module.youtube_links,
      };
    }),
  });
}

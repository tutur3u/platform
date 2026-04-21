import { createAdminClient } from '@tuturuuu/supabase/next/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ Id: string }> }
) {
  try {
    const { Id } = await params;
    const sbAdmin = await createAdminClient();

    // Fetch group
    const { data: group, error: groupError } = await sbAdmin
      .from('workspace_user_groups')
      .select('*')
      .eq('id', Id)
      .maybeSingle();

    if (groupError) throw groupError;
    if (!group) {
      return Response.json({ error: 'Group not found' }, { status: 404 });
    }

    // Fetch published modules for the group
    const { data: modules, error: modulesError } = await sbAdmin
      .from('workspace_course_modules')
      .select('*')
      .eq('group_id', Id)
      .eq('is_published', true)
      .order('sort_key', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (modulesError) throw modulesError;

    const publishedModules = modules ?? [];
    const moduleIds = publishedModules.map((m) => m.id);

    const [quizzesRes, flashcardsRes, quizSetsRes] = await Promise.all([
      moduleIds.length > 0
        ? sbAdmin
            .from('course_module_quizzes')
            .select('module_id')
            .in('module_id', moduleIds)
        : { data: [], error: null },
      moduleIds.length > 0
        ? sbAdmin
            .from('course_module_flashcards')
            .select('module_id')
            .in('module_id', moduleIds)
        : { data: [], error: null },
      moduleIds.length > 0
        ? sbAdmin
            .from('course_module_quiz_sets')
            .select('module_id')
            .in('module_id', moduleIds)
        : { data: [], error: null },
    ]);

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

    const compiledModules = publishedModules.map((m) => ({
      ...m,
      quizzes: quizCount.get(m.id) ?? 0,
      flashcards: flashcardCount.get(m.id) ?? 0,
      quizSets: quizSetCount.get(m.id) ?? 0,
    }));

    return Response.json({
      group,
      modules: compiledModules,
    });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

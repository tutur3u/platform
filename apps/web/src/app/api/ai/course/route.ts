import { google } from '@ai-sdk/google';
import { executeConvertFileToMarkdown } from '@tuturuuu/ai/tools/executors/markitdown';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TablesInsert } from '@tuturuuu/types';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import {
  COURSE_GENERATION_PROMPT,
  CourseGenerationSchema,
  GenerateCourseRequestSchema,
} from './schema';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isGroupStoragePath(
  storagePath: string,
  normalizedWsId: string,
  groupId: string
) {
  return (
    storagePath.startsWith(`${normalizedWsId}/user-groups/${groupId}/`) ||
    storagePath.startsWith(`user-groups/${groupId}/`)
  );
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createClient(request);

    // 1. Authenticate
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse & validate request body
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsedBody = GenerateCourseRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request body', issues: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const { fileName, groupId, maxCharacters, storagePath, wsId } =
      parsedBody.data;
    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
    const sanitizedStoragePath = sanitizePath(storagePath);

    if (
      sanitizedStoragePath === null ||
      !isGroupStoragePath(sanitizedStoragePath, normalizedWsId, groupId)
    ) {
      return NextResponse.json(
        { error: 'Storage path is not authorized for this group' },
        { status: 403 }
      );
    }

    // Normalize path to always include workspace prefix (markitdown executor requires it)
    const normalizedStoragePath = sanitizedStoragePath.startsWith(
      `${normalizedWsId}/`
    )
      ? sanitizedStoragePath
      : `${normalizedWsId}/${sanitizedStoragePath}`;

    // 3. Permission check
    const permissions = await getPermissions({ wsId: normalizedWsId, request });
    if (
      !permissions?.containsPermission('view_user_groups') ||
      !permissions.containsPermission('update_user_groups')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

    // 4. Verify group exists in workspace
    const { data: group, error: groupError } = await sbAdmin
      .from('workspace_user_groups')
      .select('id, ws_id')
      .eq('ws_id', normalizedWsId)
      .eq('id', groupId)
      .maybeSingle();

    if (groupError) {
      return NextResponse.json(
        { error: 'Failed to verify user group', message: groupError.message },
        { status: 500 }
      );
    }
    if (!group) {
      return NextResponse.json(
        { error: 'User group not found' },
        { status: 404 }
      );
    }

    // 5. Extract text from document via MarkItDown
    const markitdownResult = await executeConvertFileToMarkdown(
      {
        storagePath: normalizedStoragePath,
        fileName,
        maxCharacters: maxCharacters || 120_000,
      },
      {
        wsId: normalizedWsId,
        userId: user.id,
        supabase,
      }
    );

    if (!markitdownResult.ok) {
      return NextResponse.json(
        {
          error: markitdownResult.error,
          details: 'Failed to extract text from document.',
        },
        { status: 500 }
      );
    }

    // 6. Generate structured course via AI SDK
    const { object } = await generateObject({
      model: google('gemini-2.0-flash'),
      schema: CourseGenerationSchema,
      system: COURSE_GENERATION_PROMPT,
      prompt: `Analyze the following document and create structured course modules with quizzes and flashcards.\n\nDocument Content:\n${markitdownResult.markdown}`,
    });

    // 7. Resolve or create module group
    const { data: existingModuleGroup, error: moduleGroupError } = await sbAdmin
      .from('workspace_course_module_groups')
      .select('id')
      .eq('group_id', groupId)
      .order('sort_key', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (moduleGroupError) {
      return NextResponse.json(
        {
          error: 'Failed to find a target module group.',
          message: moduleGroupError.message,
        },
        { status: 500 }
      );
    }

    let moduleGroupId = existingModuleGroup?.id;
    if (!moduleGroupId) {
      const payload: TablesInsert<'workspace_course_module_groups'> = {
        group_id: groupId,
        sort_key: 0,
        title: 'Generated modules',
      };

      const { data: created, error: createError } = await sbAdmin
        .from('workspace_course_module_groups')
        .insert(payload)
        .select('id')
        .single();

      if (createError) {
        return NextResponse.json(
          {
            error: 'Failed to create module group.',
            message: createError.message,
          },
          { status: 500 }
        );
      }
      moduleGroupId = created.id;
    }

    // 8. Determine starting sort_key
    const { data: maxSortKeyRow, error: maxSortKeyError } = await sbAdmin
      .from('workspace_course_modules')
      .select('sort_key')
      .eq('group_id', groupId)
      .eq('module_group_id', moduleGroupId)
      .order('sort_key', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (maxSortKeyError) {
      return NextResponse.json(
        {
          error: 'Failed to determine module ordering.',
          message: maxSortKeyError.message,
        },
        { status: 500 }
      );
    }

    const startingSortKey = (maxSortKeyRow?.sort_key ?? -1) + 1;

    // 9. Insert modules
    const moduleInsertPayload: TablesInsert<'workspace_course_modules'>[] =
      object.modules.map((mod, index) => ({
        content: mod.content,
        extra_content: mod.extra_content ? { text: mod.extra_content } : null,
        group_id: groupId,
        module_group_id: moduleGroupId,
        name: mod.name,
        sort_key: startingSortKey + index,
        youtube_links: mod.youtube_links ?? null,
      }));

    const { data: createdModules, error: insertError } = await sbAdmin
      .from('workspace_course_modules')
      .insert(moduleInsertPayload)
      .select('id, name, sort_key');

    if (insertError) {
      return NextResponse.json(
        {
          data: object,
          error: 'Failed to save generated modules',
          message: insertError.message,
        },
        { status: 500 }
      );
    }

    // 10. Insert quizzes, quiz options, flashcards per module
    const quizResults: Array<{ moduleId: string; quizCount: number }> = [];
    const flashcardResults: Array<{
      moduleId: string;
      flashcardCount: number;
    }> = [];

    for (let i = 0; i < createdModules.length; i++) {
      const dbModule = createdModules[i]!;
      const generatedModule = object.modules[i]!;

      // Insert quizzes
      if (generatedModule.quizzes?.length) {
        let quizCount = 0;
        for (const quiz of generatedModule.quizzes) {
          const { data: createdQuiz, error: quizError } = await sbAdmin
            .from('workspace_quizzes')
            .insert({
              question: quiz.question,
              score: quiz.score,
              ws_id: normalizedWsId,
            })
            .select('id')
            .single();

          if (quizError || !createdQuiz) continue;

          await sbAdmin.from('course_module_quizzes').insert({
            module_id: dbModule.id,
            quiz_id: createdQuiz.id,
          });

          if (quiz.quiz_options.length) {
            await sbAdmin.from('quiz_options').insert(
              quiz.quiz_options.map((opt) => ({
                quiz_id: createdQuiz.id,
                value: opt.value,
                is_correct: opt.is_correct,
                explanation: opt.explanation ?? null,
              }))
            );
          }

          quizCount++;
        }
        quizResults.push({ moduleId: dbModule.id, quizCount });
      }

      // Insert flashcards
      if (generatedModule.flashcards?.length) {
        let flashcardCount = 0;
        for (const card of generatedModule.flashcards) {
          const { data: createdCard, error: cardError } = await sbAdmin
            .from('workspace_flashcards')
            .insert({
              front: card.front,
              back: card.back,
              ws_id: normalizedWsId,
            })
            .select('id')
            .single();

          if (cardError || !createdCard) continue;

          await sbAdmin.from('course_module_flashcards').insert({
            module_id: dbModule.id,
            flashcard_id: createdCard.id,
          });

          flashcardCount++;
        }
        flashcardResults.push({ moduleId: dbModule.id, flashcardCount });
      }
    }

    // 11. Return result
    return NextResponse.json({
      createdModules,
      quizResults,
      flashcardResults,
      metadata: {
        title: markitdownResult.title,
        creditsCharged: markitdownResult.creditsCharged,
        truncated: markitdownResult.truncated,
        totalModules: createdModules.length,
        totalQuizzes: quizResults.reduce((s, r) => s + r.quizCount, 0),
        totalFlashcards: flashcardResults.reduce(
          (s, r) => s + r.flashcardCount,
          0
        ),
      },
    });
  } catch (error) {
    console.error('Failed to generate course:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

import { google } from '@ai-sdk/google';
import { executeConvertFileToMarkdown } from '@tuturuuu/ai/tools/executors/markitdown';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { TablesInsert } from '@tuturuuu/types';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { requireTeachWorkspaceAccess } from '@/lib/teach/api';
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

type TipTapTextNode = {
  type: 'text';
  text: string;
};

function textContent(text: string): TipTapTextNode[] | undefined {
  return text.trim() ? [{ type: 'text', text: text.trim() }] : undefined;
}

function markdownToTipTapDocument(markdown: string) {
  // Split into blocks separated by one or more blank lines
  const blocks = markdown
    .split(/\n{2,}/u)
    .map((b) => b.trim())
    .filter(Boolean);

  const content: any[] = [];

  for (const block of blocks) {
    // Heading: #, ##, ###
    const heading = block.match(/^(#{1,6})\s+(.+)$/u);
    if (heading?.[1] && heading[2]) {
      content.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: textContent(heading[2]),
      });
      continue;
    }

    // List detection: lines starting with -, *, + or numbered lists
    const lines = block
      .split(/\n+/u)
      .map((l) => l.trim())
      .filter(Boolean);
    const isList =
      lines.length > 0 && lines.every((ln) => /^([*+-]|\d+\.)\s+/.test(ln));
    if (isList && lines[0]) {
      // Determine if ordered
      const firstMatch = lines[0].match(/^\s*(\d+)\./);
      const ordered = Boolean(firstMatch);
      const listNode: any = {
        type: ordered ? 'ordered_list' : 'bullet_list',
        ...(ordered ? { attrs: { order: 1 } } : {}),
        content: [],
      };

      for (const ln of lines) {
        const itemText = ln.replace(/^([*+-]|\d+\.)\s+/, '');
        listNode.content.push({
          type: 'list_item',
          content: [
            { type: 'paragraph', content: textContent(itemText) || [] },
          ],
        });
      }

      content.push(listNode);
      continue;
    }

    // Fallback: paragraph (preserve internal newlines as line breaks)
    content.push({
      type: 'paragraph',
      content: textContent(block.replace(/\n+/gu, '\n')),
    });
  }

  return {
    type: 'doc',
    content:
      content.length > 0
        ? content
        : [{ type: 'paragraph', content: textContent(markdown) }],
  };
}

// Normalize incoming module/section content into a TipTap `doc` object.
function normalizeContentToTipTap(content: unknown) {
  // Already a TipTap doc?
  if (
    content &&
    typeof content === 'object' &&
    (content as any).type === 'doc'
  ) {
    return content as any;
  }

  // If it's a string assume Markdown and convert
  if (typeof content === 'string') {
    return markdownToTipTapDocument(content);
  }

  // Unknown -> empty doc
  return { type: 'doc', content: [] };
}

// Build a TipTap document from an array of sections where each section may be TipTap or Markdown.
function sectionsToTipTapDoc(sections: Array<any>) {
  const contentBlocks: any[] = [];
  for (const sec of sections) {
    if (!sec) continue;
    if (sec.title && typeof sec.title === 'string') {
      const heading = {
        type: 'heading',
        attrs: { level: 2 },
        content: textContent(sec.title),
      };
      contentBlocks.push(heading);
    }

    if (sec.content) {
      if (sec.content.type === 'doc' && Array.isArray(sec.content.content)) {
        contentBlocks.push(...sec.content.content);
      } else if (typeof sec.content === 'string') {
        const doc = markdownToTipTapDocument(sec.content as string);
        if (Array.isArray(doc.content)) contentBlocks.push(...doc.content);
      }
    }
  }

  return {
    type: 'doc',
    content:
      contentBlocks.length > 0
        ? contentBlocks
        : [{ type: 'paragraph', content: textContent('') }],
  };
}

async function cleanupGeneratedCourseArtifacts({
  flashcardIds,
  moduleIds,
  quizIds,
  sbAdmin,
}: {
  flashcardIds: string[];
  moduleIds: string[];
  quizIds: string[];
  sbAdmin: TypedSupabaseClient;
}) {
  const cleanupErrors: Array<{ label: string; error: unknown }> = [];
  const runCleanup = async (
    label: string,
    operation: () => PromiseLike<{ error: unknown }>
  ) => {
    try {
      const { error } = await operation();
      if (error) cleanupErrors.push({ label, error });
    } catch (error) {
      cleanupErrors.push({ label, error });
    }
  };

  if (quizIds.length) {
    await runCleanup('quiz_options', () =>
      sbAdmin.from('quiz_options').delete().in('quiz_id', quizIds)
    );
    await runCleanup('course_module_quizzes', () =>
      sbAdmin.from('course_module_quizzes').delete().in('quiz_id', quizIds)
    );
    await runCleanup('workspace_quizzes', () =>
      sbAdmin.from('workspace_quizzes').delete().in('id', quizIds)
    );
  }

  if (flashcardIds.length) {
    await runCleanup('course_module_flashcards', () =>
      sbAdmin
        .from('course_module_flashcards')
        .delete()
        .in('flashcard_id', flashcardIds)
    );
    await runCleanup('workspace_flashcards', () =>
      sbAdmin.from('workspace_flashcards').delete().in('id', flashcardIds)
    );
  }

  if (moduleIds.length) {
    await runCleanup('workspace_course_modules', () =>
      sbAdmin.from('workspace_course_modules').delete().in('id', moduleIds)
    );
  }

  if (cleanupErrors.length) {
    serverLogger.error('Failed to clean up generated course artifacts', {
      cleanupErrors,
    });
  }
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export const POST = withSessionAuth(
  async (request, context) => {
    try {
      // Use the request-scoped supabase client and session context provided
      // by `withSessionAuth` so app-session and forwarded auth work consistently.
      const supabase = context.supabase;

      if (!context.user) {
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

      let { fileName, groupId, maxCharacters, storagePath, wsId, fileId } =
        parsedBody.data;

      // Require teach workspace access consistent with other Teach routes
      const access = await requireTeachWorkspaceAccess({
        context,
        permission: 'update_user_groups',
        wsId,
      });
      if (access instanceof NextResponse) return access;

      const normalizedWsId = access.normalizedWsId;
      const sbAdmin = access.sbAdmin as TypedSupabaseClient;

      // Resolve file path/name from storage.objects by fileId if provided
      if (fileId) {
        const { data: storageObject, error: storageObjectError } = await sbAdmin
          .schema('storage')
          .from('objects')
          .select('name, metadata')
          .eq('id', fileId)
          .single();

        if (storageObjectError || !storageObject) {
          return NextResponse.json(
            { error: 'Storage object not found' },
            { status: 404 }
          );
        }

        if (!storageObject.name) {
          return NextResponse.json(
            { error: 'Invalid storage object name' },
            { status: 400 }
          );
        }

        storagePath = storageObject.name;
        fileName = storageObject.name.split('/').pop() || 'file';
      }

      if (!storagePath) {
        return NextResponse.json(
          { error: 'Storage path or file ID is required' },
          { status: 400 }
        );
      }

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
      // 3. Permission check (already validated by requireTeachWorkspaceAccess,
      // but still fetch a permissions object for completeness)
      const permissions = await getPermissions({
        user: context.user,
        wsId: normalizedWsId,
      });
      if (!permissions) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

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
          userId: access.userId,
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
      const { data: existingModuleGroup, error: moduleGroupError } =
        await sbAdmin
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
        object.modules.map((mod, index) => {
          // Prioritize sections array if present, otherwise fall back to explicit content.
          let tiptapContent: any;
          if ((mod as any).sections && (mod as any).sections.length > 0) {
            tiptapContent = sectionsToTipTapDoc((mod as any).sections as any[]);
          } else if ((mod as any).content) {
            tiptapContent = normalizeContentToTipTap((mod as any).content);
          } else {
            tiptapContent = { type: 'doc', content: [] };
          }

          let extraContent = null;
          if ((mod as any).extra_content) {
            if ((mod as any).extra_content.type === 'doc') {
              extraContent = (mod as any).extra_content;
            } else if (typeof (mod as any).extra_content === 'string') {
              extraContent = markdownToTipTapDocument(
                (mod as any).extra_content
              );
            }
          }

          return {
            content: tiptapContent,
            extra_content: extraContent,
            group_id: groupId,
            module_group_id: moduleGroupId,
            name: mod.name,
            sort_key: startingSortKey + index,
            youtube_links: mod.youtube_links ?? null,
          };
        });

      const { data: createdModules, error: insertError } = await sbAdmin
        .from('workspace_course_modules')
        .insert(moduleInsertPayload)
        .select('id, name, sort_key');

      if (insertError || !createdModules) {
        return NextResponse.json(
          {
            data: object,
            error: 'Failed to save generated modules',
            message: insertError?.message ?? 'No modules were returned.',
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
      const createdFlashcardIds: string[] = [];
      const createdModuleIds = createdModules.map(
        (courseModule) => courseModule.id
      );
      const createdQuizIds: string[] = [];

      try {
        for (const [index, dbModule] of createdModules.entries()) {
          const generatedModule = object.modules[index];
          if (!generatedModule) {
            throw new Error(
              'Generated module result did not match saved modules'
            );
          }

          // Insert quizzes
          if (generatedModule.quizzes?.length) {
            const { data: createdQuizzes, error: quizError } = await sbAdmin
              .from('workspace_quizzes')
              .insert(
                generatedModule.quizzes.map((quiz) => ({
                  question: quiz.question,
                  score: quiz.score,
                  ws_id: normalizedWsId,
                }))
              )
              .select('id');

            if (quizError || !createdQuizzes) {
              throw (
                quizError ?? new Error('Failed to create generated quizzes')
              );
            }

            if (createdQuizzes.length !== generatedModule.quizzes.length) {
              throw new Error(
                'Generated quiz insert returned an unexpected count'
              );
            }

            createdQuizIds.push(...createdQuizzes.map((quiz) => quiz.id));

            const { error: quizLinkError } = await sbAdmin
              .from('course_module_quizzes')
              .insert(
                createdQuizzes.map((createdQuiz) => ({
                  module_id: dbModule.id,
                  quiz_id: createdQuiz.id,
                }))
              );

            if (quizLinkError) throw quizLinkError;

            const quizOptions = generatedModule.quizzes.flatMap(
              (quiz, quizIndex) => {
                const createdQuiz = createdQuizzes[quizIndex];
                if (!createdQuiz) {
                  throw new Error('Generated quiz option mapping failed');
                }
                return quiz.quiz_options.map((option) => ({
                  quiz_id: createdQuiz.id,
                  value: option.value,
                  is_correct: option.is_correct,
                  explanation: option.explanation ?? null,
                }));
              }
            );

            if (quizOptions.length) {
              const { error: quizOptionsError } = await sbAdmin
                .from('quiz_options')
                .insert(quizOptions);

              if (quizOptionsError) throw quizOptionsError;
            }

            quizResults.push({
              moduleId: dbModule.id,
              quizCount: createdQuizzes.length,
            });
          }

          // Insert flashcards
          if (generatedModule.flashcards?.length) {
            const { data: createdFlashcards, error: flashcardError } =
              await sbAdmin
                .from('workspace_flashcards')
                .insert(
                  generatedModule.flashcards.map((card) => ({
                    front: card.front,
                    back: card.back,
                    ws_id: normalizedWsId,
                  }))
                )
                .select('id');

            if (flashcardError || !createdFlashcards) {
              throw (
                flashcardError ??
                new Error('Failed to create generated flashcards')
              );
            }

            if (
              createdFlashcards.length !== generatedModule.flashcards.length
            ) {
              throw new Error(
                'Generated flashcard insert returned an unexpected count'
              );
            }

            createdFlashcardIds.push(
              ...createdFlashcards.map((card) => card.id)
            );

            const { error: flashcardLinkError } = await sbAdmin
              .from('course_module_flashcards')
              .insert(
                createdFlashcards.map((createdCard) => ({
                  module_id: dbModule.id,
                  flashcard_id: createdCard.id,
                }))
              );

            if (flashcardLinkError) throw flashcardLinkError;

            flashcardResults.push({
              flashcardCount: createdFlashcards.length,
              moduleId: dbModule.id,
            });
          }
        }
      } catch (error) {
        try {
          await cleanupGeneratedCourseArtifacts({
            flashcardIds: createdFlashcardIds,
            moduleIds: createdModuleIds,
            quizIds: createdQuizIds,
            sbAdmin,
          });
        } catch (cleanupError) {
          serverLogger.error('Generated course cleanup failed unexpectedly', {
            cleanupError,
            originalError: error,
          });
        }
        throw error;
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
      serverLogger.error('Failed to generate course', { error });
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: { targetApp: 'teach' }, allowAiTempAuth: true }
);

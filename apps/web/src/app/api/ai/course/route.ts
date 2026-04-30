import { google } from '@ai-sdk/google';
import { executeConvertFileToMarkdown } from '@tuturuuu/ai/tools/executors/markitdown';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const ModuleGenerationSchema = z.object({
  modules: z
    .array(
      z.object({
        name: z
          .string()
          .describe('The main title of the module derived from the document.'),
        content: z
          .string()
          .describe(
            'The detailed learning content or lesson formatted in markdown.'
          ),
        extra_content: z
          .string()
          .describe('Key takeaways, glossary, or supplementary information.')
          .optional(),
        quiz_questions: z
          .array(
            z.object({
              question: z.string(),
              options: z.array(z.string()),
              correct_answer: z.string(),
            })
          )
          .describe('Suggested quiz questions based on the document.')
          .optional(),
      })
    )
    .describe(
      'A list of course modules extracted from the document. Large documents should be broken down into multiple modules.'
    ),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient(request);

    // 1. Authenticate user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request payload
    const body = await request.json();
    const { wsId, groupId, storagePath, fileName, maxCharacters } = body;

    if (!wsId || !storagePath) {
      return NextResponse.json(
        { error: 'Missing required fields: wsId and storagePath' },
        { status: 400 }
      );
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    // 3. Extract text from PDF using MarkItDown tool
    const markitdownResult = await executeConvertFileToMarkdown(
      {
        storagePath,
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

    const markdownText = markitdownResult.markdown;

    const { object } = await generateObject({
      model: google('gemini-2.0-flash'),
      schema: ModuleGenerationSchema,
      system:
        'You are an expert educator. Your task is to analyze documents and extract structured, engaging learning modules from them.',
      prompt: `Please create structured course modules based on the following document text. Extract the main lessons, key takeaways, and suggest a few quiz questions to test the learner's knowledge. Break down large documents into multiple logical modules.\n\nDocument Content:\n${markdownText}`,
    });

    let createdModules = null;
    if (groupId) {
      const sbAdmin = await createAdminClient();

      const { data: existingModules } = await sbAdmin
        .from('workspace_course_modules')
        .select('id')
        .eq('group_id', groupId);

      const startingSortKey = existingModules ? existingModules.length : 0;

      const insertPayload = object.modules.map((module, index) => ({
        name: module.name,
        content: module.content,
        extra_content: {
          text: module.extra_content,
          quiz_questions: module.quiz_questions,
        },
        group_id: groupId,
        sort_key: startingSortKey + index,
      }));

      const { data, error } = await sbAdmin
        .from('workspace_course_modules')
        .insert(insertPayload)
        .select('*');

      if (error) {
        console.error('Failed to insert AI generated modules:', error);
      } else {
        createdModules = data;
      }
    }

    // 6. Return the generated module data
    return NextResponse.json({
      data: object,
      createdModules,
      metadata: {
        title: markitdownResult.title,
        creditsCharged: markitdownResult.creditsCharged,
        truncated: markitdownResult.truncated,
      },
    });
  } catch (error) {
    console.error('Failed to generate course module:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

import { google } from '@ai-sdk/google';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { embed } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
    taskId: string;
  }>;
}

/**
 * Generate and update embedding for a specific task
 * Requires GOOGLE_GENERATIVE_AI_API_KEY to be set
 */
export async function POST(request: Request, { params }: Params) {
  try {
    // Check if API key is available
    const hasApiKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!hasApiKey) {
      return NextResponse.json(
        { message: 'Embedding generation unavailable: API key not configured' },
        { status: 200 }
      );
    }

    const supabase = await createClient(request);
    const { wsId: rawWsId, taskId } = await params;

    // Check authentication
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const parsedTaskId = z.guid().safeParse(taskId);
    if (!parsedTaskId.success) {
      return NextResponse.json({ message: 'Invalid task ID' }, { status: 400 });
    }

    const wsId = await normalizeWorkspaceId(rawWsId, supabase);
    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      console.error(
        'Error verifying workspace membership for embedding generation:',
        membership.error
      );
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

    // Fetch the task
    const { data: task, error: fetchError } = await sbAdmin
      .from('tasks')
      .select(
        `
        id,
        name,
        description,
        task_lists!inner(
          workspace_boards!inner(
            ws_id
          )
        )
      `
      )
      .eq('id', parsedTaskId.data)
      .eq('task_lists.workspace_boards.ws_id', wsId)
      .maybeSingle();

    if (fetchError) {
      console.error('Error loading task for embedding generation:', fetchError);
      return NextResponse.json(
        { message: 'Failed to load task' },
        { status: 500 }
      );
    }

    if (!task) {
      return NextResponse.json({ message: 'Task not found' }, { status: 404 });
    }

    // Create text content for embedding
    // Combine task name and description text (extract from JSONB if present)
    let descriptionText = '';
    if (task.description) {
      try {
        // Try to extract text from TipTap JSON structure
        const descJson =
          typeof task.description === 'string'
            ? JSON.parse(task.description)
            : task.description;
        descriptionText = extractTextFromTipTap(descJson);
      } catch {
        descriptionText = String(task.description);
      }
    }

    const textForEmbedding = `${task.name}\n${descriptionText}`.trim();

    // Generate embedding using Google Gemini
    const { embedding } = await embed({
      model: google.embedding('gemini-embedding-001'),
      value: textForEmbedding,
      providerOptions: {
        google: {
          outputDimensionality: 768,
          taskType: 'SEMANTIC_SIMILARITY',
        },
      },
    });

    // Update task with embedding
    const { data: updatedTask, error: updateError } = await sbAdmin
      .from('tasks')
      .update({ embedding: JSON.stringify(embedding) })
      .eq('id', task.id)
      .select('id')
      .maybeSingle();

    if (updateError) {
      console.error('Error updating task embedding:', updateError);
      return NextResponse.json(
        { message: 'Error updating embedding', error: updateError.message },
        { status: 500 }
      );
    }

    if (!updatedTask) {
      return NextResponse.json({ message: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Embedding generated successfully',
      taskId: parsedTaskId.data,
    });
  } catch (error) {
    console.error('Error generating embedding:', error);
    return NextResponse.json(
      {
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Extract plain text from TipTap JSON content
 */
function extractTextFromTipTap(content: any): string {
  if (!content) return '';

  if (typeof content === 'string') return content;

  if (content.type === 'text') {
    return content.text || '';
  }

  if (Array.isArray(content)) {
    return content.map((node) => extractTextFromTipTap(node)).join(' ');
  }

  if (content.content && Array.isArray(content.content)) {
    return content.content
      .map((node: any) => extractTextFromTipTap(node))
      .join(' ');
  }

  return '';
}

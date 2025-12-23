import { google } from '@ai-sdk/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import { embed } from 'ai';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

/**
 * On-demand batch embedding generation for workspace tasks
 * Generates embeddings for all tasks without embeddings in the workspace
 */
export async function POST(_: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const { wsId } = await params;

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Check workspace membership
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // Fetch tasks without embeddings for this workspace
    const { data: tasks, error: fetchError } = await supabase
      .from('tasks')
      .select(
        `
        id,
        name,
        description,
        list_id,
        task_lists!inner(
          id,
          board_id,
          workspace_boards!inner(
            id,
            ws_id
          )
        )
      `
      )
      .is('embedding', null)
      .is('deleted_at', null)
      .eq('task_lists.workspace_boards.ws_id', wsId)
      .limit(200);

    if (fetchError) {
      console.error('Error fetching tasks:', fetchError);
      return NextResponse.json(
        { message: 'Failed to fetch tasks', error: fetchError.message },
        { status: 500 }
      );
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({
        message: 'No tasks need embeddings',
        processed: 0,
        success: 0,
        failed: 0,
      });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as { taskId: string; error: string }[],
    };

    // Process tasks
    for (const task of tasks) {
      try {
        // Extract text from description
        let descriptionText = '';
        if (task.description) {
          try {
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

        // Skip if no meaningful content
        if (!textForEmbedding) {
          results.failed++;
          results.errors.push({
            taskId: task.id,
            error: 'No content to embed',
          });
          continue;
        }

        // Generate embedding
        const { embedding } = await embed({
          model: google.embeddingModel('gemini-embedding-001'),
          value: textForEmbedding,
          providerOptions: {
            google: {
              outputDimensionality: 768,
              taskType: 'SEMANTIC_SIMILARITY',
            },
          },
        });

        // Validate embedding shape before writing
        if (!Array.isArray(embedding) || embedding.length !== 768) {
          results.failed++;
          results.errors.push({
            taskId: task.id,
            error: 'Invalid embedding shape',
          });
          continue;
        }

        // Update task with embedding (pgvector expects number[] not JSON string)
        const { error: updateError } = await supabase
          .from('tasks')
          .update({ embedding: JSON.stringify(embedding) })
          .eq('id', task.id);

        if (updateError) {
          results.failed++;
          results.errors.push({
            taskId: task.id,
            error: updateError.message,
          });
        } else {
          results.success++;
        }
      } catch (error) {
        results.failed++;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        results.errors.push({
          taskId: task.id,
          error: errorMessage,
        });
      }
    }

    return NextResponse.json({
      message: 'Batch embedding generation completed',
      processed: tasks.length,
      success: results.success,
      failed: results.failed,
      errors: results.errors.slice(0, 20), // Limit error messages
    });
  } catch (error) {
    console.error('Error in batch embedding generation:', error);
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

export const maxDuration = 300; // 5 minutes

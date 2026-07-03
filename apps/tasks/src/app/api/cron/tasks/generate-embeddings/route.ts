import {
  createMeteredTextEmbedding,
  GEMINI_EMBEDDING_2_DIMENSIONS,
} from '@tuturuuu/ai/embeddings/metered';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { serverLogger, withCronLogDrain } from '@/lib/infrastructure/log-drain';

/**
 * Cron job to generate embeddings for tasks without embeddings
 * Runs daily to ensure all tasks have embeddings for semantic search
 */
export async function GET(req: NextRequest) {
  return withCronLogDrain(
    {
      jobId: 'tasks-generate-embeddings',
      path: '/api/cron/tasks/generate-embeddings',
      request: req,
    },
    () => handleGET(req)
  );
}

async function handleGET(req: NextRequest) {
  // Verify cron secret
  const cronSecret =
    process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';

  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET or VERCEL_CRON_SECRET is not set' },
      { status: 500 }
    );
  }

  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const supabase = await createAdminClient();

    // Fetch tasks without embeddings (limit to 100 per run to avoid timeout)
    const { data: tasks, error: fetchError } = await supabase
      .from('tasks')
      .select(
        `
        id,
        name,
        description,
        creator_id,
        task_lists!inner(
          workspace_boards!inner(
            ws_id
          )
        )
      `
      )
      .is('embedding', null)
      .is('deleted_at', null)
      .limit(100);

    if (fetchError) {
      serverLogger.error('Error fetching tasks:', fetchError);
      return NextResponse.json(
        {
          ok: false,
          error: 'Failed to fetch tasks',
          details: fetchError.message,
        },
        { status: 500 }
      );
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No tasks need embeddings',
        processed: 0,
      });
    }

    // Prepare task data for batch embedding
    const taskData: Array<{
      id: string;
      text: string;
      index: number;
      userId: string | null;
      wsId: string | null;
    }> = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (!task?.id) continue;

      // Extract text from description
      let descriptionText = '';
      if (task?.description) {
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

      const textForEmbedding = `${task?.name}\n${descriptionText}`.trim();

      // Only include tasks with meaningful content
      if (textForEmbedding) {
        const taskList = Array.isArray(task.task_lists)
          ? task.task_lists[0]
          : task.task_lists;
        const workspaceBoard = Array.isArray(taskList?.workspace_boards)
          ? taskList?.workspace_boards[0]
          : taskList?.workspace_boards;

        taskData.push({
          id: task.id,
          text: textForEmbedding,
          index: i,
          userId: task.creator_id,
          wsId: workspaceBoard?.ws_id ?? null,
        });
      }
    }

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Skip if no tasks to process
    if (taskData.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No tasks with content to embed',
        processed: 0,
        failed: tasks.length,
      });
    }

    for (const task of taskData) {
      try {
        if (!task.userId || !task.wsId) {
          results.skipped++;
          results.errors.push(`Task ${task.id}: Missing billable context`);
          continue;
        }

        const embeddingResult = await createMeteredTextEmbedding({
          metadata: {
            operation: 'cron_task_embedding_generation',
            taskId: task.id,
          },
          source: 'task_embedding',
          taskType: 'RETRIEVAL_DOCUMENT',
          userId: task.userId,
          value: task.text,
          wsId: task.wsId,
        });

        if (!embeddingResult.ok) {
          results.skipped++;
          results.errors.push(
            `Task ${task.id}: Skipped ${embeddingResult.reason}`
          );
          continue;
        }

        if (
          embeddingResult.embedding.length !== GEMINI_EMBEDDING_2_DIMENSIONS
        ) {
          results.failed++;
          results.errors.push(`Task ${task.id}: Invalid embedding shape`);
          continue;
        }

        const { error: updateError } = await supabase
          .from('tasks')
          .update({ embedding: JSON.stringify(embeddingResult.embedding) })
          .eq('id', task.id);

        if (updateError) {
          results.failed++;
          results.errors.push(`Task ${task.id}: ${updateError.message}`);
        } else {
          results.success++;
        }
      } catch (error) {
        results.failed++;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`Task ${task.id}: ${errorMessage}`);
      }
    }

    // Add skipped tasks (no content) to failed count
    results.failed += tasks.length - taskData.length;
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (!taskData.some((t) => t.id === task?.id)) {
        results.errors.push(
          `Task ${task?.id || 'unknown'}: No content to embed`
        );
      }
    }

    return NextResponse.json({
      ok: true,
      processed: tasks.length,
      success: results.success,
      failed: results.failed,
      skipped: results.skipped,
      errors: results.errors.slice(0, 10), // Limit error messages
    });
  } catch (error) {
    serverLogger.error('Cron job error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
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

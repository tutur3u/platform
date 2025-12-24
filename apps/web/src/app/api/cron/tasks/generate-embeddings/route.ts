import { google } from '@ai-sdk/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import { embedMany } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Cron job to generate embeddings for tasks without embeddings
 * Runs daily to ensure all tasks have embeddings for semantic search
 */
export async function GET(req: NextRequest) {
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
    const supabase = await createClient();

    // Fetch tasks without embeddings (limit to 100 per run to avoid timeout)
    const { data: tasks, error: fetchError } = await supabase
      .from('tasks')
      .select('id, name, description')
      .is('embedding', null)
      .is('deleted_at', null)
      .limit(100);

    if (fetchError) {
      console.error('Error fetching tasks:', fetchError);
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
        taskData.push({
          id: task.id,
          text: textForEmbedding,
          index: i,
        });
      }
    }

    const results = {
      success: 0,
      failed: 0,
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

    try {
      // Generate embeddings for all tasks in parallel
      const { embeddings } = await embedMany({
        model: google.embeddingModel('gemini-embedding-001'),
        values: taskData.map((t) => t.text),
        maxParallelCalls: 10,
        providerOptions: {
          google: {
            outputDimensionality: 768,
            taskType: 'SEMANTIC_SIMILARITY',
          },
        },
      });

      // Update tasks with embeddings in parallel
      const updatePromises = taskData.map(async (task, idx) => {
        try {
          const embedding = embeddings[idx];

          // Validate embedding shape before writing
          if (!Array.isArray(embedding) || embedding.length !== 768) {
            results.failed++;
            results.errors.push(`Task ${task.id}: Invalid embedding shape`);
            return;
          }

          const { error: updateError } = await supabase
            .from('tasks')
            .update({ embedding: JSON.stringify(embedding) })
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
      });

      await Promise.all(updatePromises);
    } catch (error) {
      // If batch embedding fails, mark all as failed
      results.failed = taskData.length;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      results.errors.push(`Batch embedding failed: ${errorMessage}`);
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
      errors: results.errors.slice(0, 10), // Limit error messages
    });
  } catch (error) {
    console.error('Cron job error:', error);
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

export const maxDuration = 300; // 5 minutes

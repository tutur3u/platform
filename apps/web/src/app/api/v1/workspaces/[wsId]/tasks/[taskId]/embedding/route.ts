import { google } from '@ai-sdk/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import { embed } from 'ai';
import { NextResponse } from 'next/server';

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
export async function POST(_: Request, { params }: Params) {
  try {
    // Check if API key is available
    const hasApiKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!hasApiKey) {
      return NextResponse.json(
        { message: 'Embedding generation unavailable: API key not configured' },
        { status: 200 }
      );
    }

    const supabase = await createClient();
    const { taskId } = await params;

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the task
    const { data: task, error: fetchError } = await supabase
      .from('tasks')
      .select('id, name, description')
      .eq('id', taskId)
      .single();

    if (fetchError || !task) {
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
      model: google.embeddingModel('gemini-embedding-001'),
      value: textForEmbedding,
      providerOptions: {
        google: {
          outputDimensionality: 768,
          taskType: 'SEMANTIC_SIMILARITY',
        },
      },
    });

    // Update task with embedding
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ embedding: JSON.stringify(embedding) })
      .eq('id', taskId);

    if (updateError) {
      console.error('Error updating task embedding:', updateError);
      return NextResponse.json(
        { message: 'Error updating embedding', error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Embedding generated successfully',
      taskId,
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

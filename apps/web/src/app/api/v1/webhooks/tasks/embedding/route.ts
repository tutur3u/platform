import { google } from '@ai-sdk/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import { embed } from 'ai';
import { NextResponse } from 'next/server';

/**
 * Webhook endpoint to generate embeddings for tasks
 * This can be called by Supabase database webhooks on INSERT/UPDATE
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    // Verify webhook secret for security
    const webhookSecret = req.headers.get('x-webhook-secret');
    const expectedSecret = process.env.SUPABASE_WEBHOOK_SECRET;

    if (expectedSecret && webhookSecret !== expectedSecret) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { type, table, record, old_record } = body;

    // Only process tasks table
    if (table !== 'tasks') {
      return NextResponse.json({ message: 'Invalid table' }, { status: 400 });
    }

    // Only process INSERT and UPDATE events
    if (type !== 'INSERT' && type !== 'UPDATE') {
      return NextResponse.json(
        { message: 'Invalid event type' },
        { status: 400 }
      );
    }

    const taskId = record.id;
    const taskName = record.name || '';
    const taskDescription = record.description;

    // Extract text from description
    let descriptionText = '';
    if (taskDescription) {
      try {
        const descJson =
          typeof taskDescription === 'string'
            ? JSON.parse(taskDescription)
            : taskDescription;
        descriptionText = extractTextFromTipTap(descJson);
      } catch {
        descriptionText = String(taskDescription);
      }
    }

    const textForEmbedding = `${taskName}\n${descriptionText}`.trim();

    // For UPDATE events, check if the text content has changed
    if (type === 'UPDATE' && old_record) {
      const oldTaskName = old_record.name || '';
      const oldTaskDescription = old_record.description;

      let oldDescriptionText = '';
      if (oldTaskDescription) {
        try {
          const oldDescJson =
            typeof oldTaskDescription === 'string'
              ? JSON.parse(oldTaskDescription)
              : oldTaskDescription;
          oldDescriptionText = extractTextFromTipTap(oldDescJson);
        } catch {
          oldDescriptionText = String(oldTaskDescription);
        }
      }

      const oldTextForEmbedding =
        `${oldTaskName}\n${oldDescriptionText}`.trim();

      // If text hasn't changed, skip embedding generation to avoid loop
      if (textForEmbedding === oldTextForEmbedding) {
        return NextResponse.json({
          message: 'Text unchanged, skipping embedding',
          taskId,
        });
      }
    }

    // Skip if no meaningful content
    if (!textForEmbedding) {
      return NextResponse.json({
        message: 'No content to embed',
        taskId,
      });
    }

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

    // Validate embedding shape before writing
    if (!Array.isArray(embedding) || embedding.length !== 768) {
      console.error('Invalid embedding shape:', embedding?.length);
      return NextResponse.json(
        { message: 'Invalid embedding shape', taskId },
        { status: 500 }
      );
    }

    // Update task with embedding (pgvector expects number[] not JSON string)
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
    console.error('Error in webhook:', error);
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

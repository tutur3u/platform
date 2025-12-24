import { google } from '@ai-sdk/google';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { embed } from 'ai';

/**
 * System-wide admin endpoint to generate embeddings for all tasks without embeddings
 * Only accessible by Tuturuuu admins
 * Uses Server-Sent Events for progress updates
 */
export async function POST(req: Request) {
  const encoder = new TextEncoder();

  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !isValidTuturuuuEmail(user.email)) {
      return new Response(
        JSON.stringify({
          message: 'Unauthorized - Tuturuuu admin access required',
        }),
        { status: 401 }
      );
    }

    // Check if Google AI API key is configured
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return new Response(
        JSON.stringify({ message: 'Embedding generation is not configured' }),
        { status: 503 }
      );
    }

    // Parse request body for batch size
    const body = await req.json();
    const batchSize = Math.min(body.batchSize || 50, 100); // Max 100 per batch

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: any) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        };

        try {
          const sbAdmin = await createAdminClient();

          // Fetch tasks without embeddings
          const { data: tasks, error: fetchError } = await sbAdmin
            .from('tasks')
            .select(
              `
              id,
              name,
              description,
              priority,
              labels:task_labels(
                label:workspace_task_labels(
                  name
                )
              ),
              assignees:task_assignees(
                user:users(
                  display_name
                )
              ),
              projects:task_project_tasks(
                project:task_projects(
                  name
                )
              )
            `
            )
            .is('embedding', null)
            .limit(batchSize);

          if (fetchError) {
            sendEvent({
              type: 'error',
              message: 'Failed to fetch tasks',
              error: fetchError.message,
            });
            controller.close();
            return;
          }

          if (!tasks || tasks.length === 0) {
            sendEvent({
              type: 'complete',
              message: 'No tasks need embeddings',
              processed: 0,
              success: 0,
              failed: 0,
            });
            controller.close();
            return;
          }

          sendEvent({
            type: 'start',
            total: tasks.length,
          });

          let successCount = 0;
          let failedCount = 0;

          // Process tasks sequentially for better progress tracking
          for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            if (!task) continue;

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

              // Build rich context
              const contextParts: string[] = [];

              // Task title
              contextParts.push(`Title: ${task.name}`);
              contextParts.push(task.name);

              // Description
              if (descriptionText) {
                contextParts.push(`Description: ${descriptionText}`);
              }

              // Priority context
              if (task.priority && typeof task.priority === 'number') {
                const priorityLabels: Record<number, string> = {
                  1: 'lowest priority',
                  2: 'low priority',
                  3: 'medium priority normal',
                  4: 'high priority important urgent',
                  5: 'highest priority critical urgent',
                };
                const priorityContext = priorityLabels[task.priority] || '';
                if (priorityContext) {
                  contextParts.push(priorityContext);
                }
              }

              // Labels
              const labels = (task.labels as any[])
                ?.map((l: any) => l.label?.name)
                .filter(Boolean);
              if (labels?.length) {
                contextParts.push(`Tags: ${labels.join(', ')}`);
              }

              // Assignees
              const assignees = (task.assignees as any[])
                ?.map((a: any) => a.user?.display_name)
                .filter(Boolean);
              if (assignees?.length) {
                contextParts.push(`Assigned to: ${assignees.join(', ')}`);
              }

              // Projects
              const projects = (task.projects as any[])
                ?.map((p: any) => p.project?.name)
                .filter(Boolean);
              if (projects?.length) {
                contextParts.push(`Projects: ${projects.join(', ')}`);
              }

              const textForEmbedding = contextParts
                .filter(Boolean)
                .join('. ')
                .trim();

              // Skip if no meaningful content
              if (!textForEmbedding) {
                failedCount++;
                sendEvent({
                  type: 'progress',
                  current: i + 1,
                  total: tasks.length,
                  success: successCount,
                  failed: failedCount,
                  taskId: task.id,
                  status: 'failed',
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
                    taskType: 'RETRIEVAL_DOCUMENT',
                  },
                },
              });

              // Validate embedding shape
              if (!Array.isArray(embedding) || embedding.length !== 768) {
                failedCount++;
                sendEvent({
                  type: 'progress',
                  current: i + 1,
                  total: tasks.length,
                  success: successCount,
                  failed: failedCount,
                  taskId: task.id,
                  status: 'failed',
                  error: 'Invalid embedding shape',
                });
                continue;
              }

              // Update task with embedding
              const { error: updateError } = await sbAdmin
                .from('tasks')
                .update({ embedding: JSON.stringify(embedding) })
                .eq('id', task.id);

              if (updateError) {
                failedCount++;
                sendEvent({
                  type: 'progress',
                  current: i + 1,
                  total: tasks.length,
                  success: successCount,
                  failed: failedCount,
                  taskId: task.id,
                  status: 'failed',
                  error: updateError.message,
                });
              } else {
                successCount++;
                sendEvent({
                  type: 'progress',
                  current: i + 1,
                  total: tasks.length,
                  success: successCount,
                  failed: failedCount,
                  taskId: task.id,
                  status: 'success',
                });
              }
            } catch (error) {
              failedCount++;
              const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
              sendEvent({
                type: 'progress',
                current: i + 1,
                total: tasks.length,
                success: successCount,
                failed: failedCount,
                taskId: task.id,
                status: 'failed',
                error: errorMessage,
              });
            }
          }

          // Send completion event
          sendEvent({
            type: 'complete',
            processed: tasks.length,
            success: successCount,
            failed: failedCount,
          });

          controller.close();
        } catch (error) {
          sendEvent({
            type: 'error',
            message: 'Internal server error',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in admin task embeddings generation:', error);
    return new Response(
      JSON.stringify({
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
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

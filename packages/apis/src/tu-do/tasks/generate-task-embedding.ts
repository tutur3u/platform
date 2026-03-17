import { google } from '@ai-sdk/google';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { embed } from 'ai';

/**
 * Extract structured text from TipTap JSON content with better context preservation
 */
function extractTextFromTipTap(content: unknown, depth = 0): string {
  if (!content) return '';

  if (typeof content === 'string') return content;

  if (typeof content === 'object' && content !== null) {
    if ('type' in content && content.type === 'text' && 'text' in content) {
      return String(content.text || '');
    }

    if (Array.isArray(content)) {
      return content
        .map((node) => extractTextFromTipTap(node, depth))
        .filter(Boolean)
        .join(' ');
    }

    if ('type' in content && 'content' in content) {
      const nodeType = String(content.type);
      const nodeContent = Array.isArray(content.content)
        ? content.content
            .map((node: unknown) => extractTextFromTipTap(node, depth + 1))
            .filter(Boolean)
            .join(' ')
        : '';

      switch (nodeType) {
        case 'heading':
          return `${nodeContent}. ${nodeContent}`;
        case 'codeBlock':
          return `code: ${nodeContent}`;
        case 'bulletList':
        case 'orderedList':
          return `list: ${nodeContent}`;
        case 'listItem':
          return `- ${nodeContent}`;
        case 'blockquote':
          return `note: ${nodeContent}`;
        case 'paragraph':
          return nodeContent;
        default:
          return nodeContent;
      }
    }
  }

  return '';
}

interface GenerateTaskEmbeddingOptions {
  taskId: string;
  taskName: string;
  taskDescription?: string | null;
  supabase: TypedSupabaseClient;
}

/**
 * Generates and saves embedding for a task
 * Only runs if GOOGLE_GENERATIVE_AI_API_KEY is set
 */
export async function generateTaskEmbedding({
  taskId,
  taskName,
  taskDescription,
  supabase,
}: GenerateTaskEmbeddingOptions): Promise<void> {
  const hasApiKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!hasApiKey) {
    return;
  }

  try {
    const { data: taskData, error: fetchError } = await supabase
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
      .eq('id', taskId)
      .single();

    if (fetchError || !taskData) {
      console.error('Failed to fetch task for embedding:', fetchError);
      return;
    }

    let descriptionText = '';
    if (taskDescription || taskData.description) {
      try {
        const desc = taskDescription || taskData.description;
        const descJson = typeof desc === 'string' ? JSON.parse(desc) : desc;
        descriptionText = extractTextFromTipTap(descJson);
      } catch {
        descriptionText = String(taskDescription || taskData.description || '');
      }
    }

    const contextParts: string[] = [];

    contextParts.push(`Title: ${taskName}`);
    contextParts.push(taskName);

    if (descriptionText) {
      contextParts.push(`Description: ${descriptionText}`);
    }

    if (taskData.priority) {
      const priorityLabels: Record<
        'low' | 'normal' | 'high' | 'critical',
        string
      > = {
        low: 'low priority',
        normal: 'medium priority normal',
        high: 'high priority important urgent',
        critical: 'highest priority critical urgent',
      };
      const priorityContext = priorityLabels[taskData.priority] || '';
      if (priorityContext) {
        contextParts.push(priorityContext);
      }
    }

    const labels = taskData.labels?.map((l) => l.label?.name).filter(Boolean);
    if (labels?.length) {
      contextParts.push(`Tags: ${labels.join(', ')}`);
    }

    const assignees = taskData.assignees
      ?.map((a) => a.user?.display_name)
      .filter(Boolean);
    if (assignees?.length) {
      contextParts.push(`Assigned to: ${assignees.join(', ')}`);
    }

    const projects = taskData.projects
      ?.map((p) => p.project?.name)
      .filter(Boolean);
    if (projects?.length) {
      contextParts.push(`Projects: ${projects.join(', ')}`);
    }

    const textForEmbedding = contextParts.filter(Boolean).join('. ').trim();

    if (!textForEmbedding) {
      return;
    }

    const { embedding } = await embed({
      model: google.embedding('gemini-embedding-001'),
      value: textForEmbedding,
      providerOptions: {
        google: {
          outputDimensionality: 768,
          taskType: 'RETRIEVAL_DOCUMENT',
        },
      },
    });

    if (!embedding?.length) {
      return;
    }

    const { error: updateError } = await supabase
      .from('tasks')
      .update({ embedding: JSON.stringify(embedding) })
      .eq('id', taskId);

    if (updateError) {
      console.error('Failed to update task embedding:', updateError);
    }
  } catch (error) {
    console.error('Error generating task embedding:', error);
  }
}

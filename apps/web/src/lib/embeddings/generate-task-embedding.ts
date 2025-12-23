import { google } from '@ai-sdk/google';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { embed } from 'ai';

/**
 * Extract structured text from TipTap JSON content with better context preservation
 */
function extractTextFromTipTap(content: unknown, depth = 0): string {
  if (!content) return '';

  if (typeof content === 'string') return content;

  if (typeof content === 'object' && content !== null) {
    // Handle text nodes
    if ('type' in content && content.type === 'text' && 'text' in content) {
      return String(content.text || '');
    }

    // Handle array of nodes
    if (Array.isArray(content)) {
      return content
        .map((node) => extractTextFromTipTap(node, depth))
        .filter(Boolean)
        .join(' ');
    }

    // Handle nodes with content
    if ('type' in content && 'content' in content) {
      const nodeType = String(content.type);
      const nodeContent = Array.isArray(content.content)
        ? content.content
            .map((node: unknown) => extractTextFromTipTap(node, depth + 1))
            .filter(Boolean)
            .join(' ')
        : '';

      // Add context markers for better semantic understanding
      switch (nodeType) {
        case 'heading':
          // Headings are important - repeat them for emphasis
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
  // Only run if API key is available
  const hasApiKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!hasApiKey) {
    return;
  }

  try {
    // Fetch task with all metadata for richer embeddings
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

    // Extract text from description
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

    // Build rich context for better semantic search
    const contextParts: string[] = [];

    // 1. Task title (most important - include multiple times)
    contextParts.push(`Title: ${taskName}`);
    contextParts.push(taskName); // Include raw title for exact matches

    // 2. Description
    if (descriptionText) {
      contextParts.push(`Description: ${descriptionText}`);
    }

    // 3. Priority context
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

    // 4. Labels
    const labels = (taskData.labels as any[])
      ?.map((l: any) => l.label?.name)
      .filter(Boolean);
    if (labels?.length) {
      contextParts.push(`Tags: ${labels.join(', ')}`);
    }

    // 5. Assignees
    const assignees = (taskData.assignees as any[])
      ?.map((a: any) => a.user?.display_name)
      .filter(Boolean);
    if (assignees?.length) {
      contextParts.push(`Assigned to: ${assignees.join(', ')}`);
    }

    // 6. Projects
    const projects = (taskData.projects as any[])
      ?.map((p: any) => p.project?.name)
      .filter(Boolean);
    if (projects?.length) {
      contextParts.push(`Projects: ${projects.join(', ')}`);
    }

    const textForEmbedding = contextParts.filter(Boolean).join('. ').trim();

    // Skip if no meaningful content
    if (!textForEmbedding) {
      return;
    }

    // Generate embedding using Google Gemini with RETRIEVAL_DOCUMENT task type
    // This optimizes the embedding for being searched against
    const { embedding } = await embed({
      model: google.embeddingModel('gemini-embedding-001'),
      value: textForEmbedding,
      providerOptions: {
        google: {
          outputDimensionality: 768,
          taskType: 'RETRIEVAL_DOCUMENT', // Better for document retrieval
        },
      },
    });

    // Validate embedding shape before writing
    if (!Array.isArray(embedding) || embedding.length !== 768) {
      console.error('Invalid embedding shape:', embedding?.length);
      return;
    }

    // Update task with embedding (pgvector expects number[] not JSON string)
    await supabase
      .from('tasks')
      .update({ embedding: JSON.stringify(embedding) })
      .eq('id', taskId);
  } catch (error) {
    // Log error but don't throw - embedding generation is optional
    console.error('Error generating task embedding:', error);
  }
}

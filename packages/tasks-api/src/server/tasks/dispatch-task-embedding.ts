import {
  hasAiDataConsent,
  requiresAiDataConsent,
} from '@tuturuuu/ai/chat/ai-data-consent';
import {
  type GenerateTaskEmbeddingOptions,
  generateTaskEmbedding,
} from './generate-task-embedding';

/**
 * Starts background embedding (Google Gemini) for a task created by
 * [request]. Callers that need Mira AI data consent and have not given it get
 * no embedding; the task itself is still created, and semantic search falls
 * back to its non-AI path for that task. [aiConsentRequired] carries the
 * requirement of an originating request when [request] is built internally.
 */
export async function dispatchTaskEmbedding(
  request: Request,
  {
    aiConsentRequired,
    ...options
  }: GenerateTaskEmbeddingOptions & {
    aiConsentRequired?: boolean;
    userId: string;
  }
) {
  try {
    if (
      (aiConsentRequired || requiresAiDataConsent(request)) &&
      !(await hasAiDataConsent(options.userId))
    ) {
      return;
    }
    await generateTaskEmbedding(options);
  } catch (error) {
    console.error('Failed to generate embedding in background:', error);
  }
}

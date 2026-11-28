import {
  aiConsentRequiredResponse,
  hasAiDataConsent,
  requiresAiDataConsent,
} from '@tuturuuu/ai/chat/ai-data-consent';
import type { ChatConversation } from '@/lib/chat/private-rpc';

/**
 * A native user message to a native AI conversation reaches Google Gemini
 * once it is stored, so it is refused before persistence when the sender has
 * not allowed AI data sharing. The conversation is only loaded for native
 * callers without consent, keeping the common path at zero extra reads.
 */
export async function nativeAiConversationConsentRefusal({
  loadConversation,
  request,
  userId,
}: {
  loadConversation: () => Promise<ChatConversation | null>;
  request: Request;
  userId: string;
}): Promise<Response | null> {
  if (!requiresAiDataConsent(request)) return null;
  if (await hasAiDataConsent(userId)) return null;
  const conversation = await loadConversation().catch(() => null);
  return conversation?.type === 'ai' ? aiConsentRequiredResponse() : null;
}

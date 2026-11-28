import {
  aiConsentRequiredResponse,
  hasAiDataConsent,
  requiresAiDataConsent,
} from '@tuturuuu/ai/chat/ai-data-consent';
import { NextResponse } from 'next/server';
import type { ChatConversation } from '@/lib/chat/private-rpc';

/**
 * A native user message to a native AI conversation reaches Google Gemini
 * once it is stored, so it is refused before persistence when the sender has
 * not allowed AI data sharing. The conversation is only loaded for native
 * callers without consent, keeping the common path at zero extra reads. A
 * failed load refuses the send (503) rather than storing it unchecked.
 */
export async function nativeAiConversationConsentRefusal({
  loadConversation,
  request,
  userId,
}: {
  loadConversation: () => Promise<ChatConversation | null>;
  request: Request;
  userId: string;
}): Promise<NextResponse | null> {
  if (!requiresAiDataConsent(request)) return null;
  if (await hasAiDataConsent(userId)) return null;
  let conversation: ChatConversation | null;
  try {
    conversation = await loadConversation();
  } catch {
    console.error('Chat conversation lookup for AI consent failed');
    return NextResponse.json(
      { message: 'Unavailable' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
  return conversation?.type === 'ai' ? aiConsentRequiredResponse() : null;
}

import { executeExternalChatCompletion } from '@/lib/external-ai/chat-completions';

export const maxDuration = 60;

export async function POST(request: Request) {
  return executeExternalChatCompletion(request);
}

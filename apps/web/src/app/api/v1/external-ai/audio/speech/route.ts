import { executeExternalSpeech } from '@/lib/external-ai/speech';

export const maxDuration = 60;

export async function POST(request: Request) {
  return executeExternalSpeech(request);
}

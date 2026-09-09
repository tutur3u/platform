import { generateText, type LanguageModel, tool } from 'ai';
import { z } from 'zod';
import { createGoogleSearchToolSet } from '../tools/google-search-tool';
import type { MeetGenerationStep } from './chat-generation-usage';

/** Search receives only the explicit public question, never the room history. */
export function publicMeetSearch(
  model: LanguageModel,
  maxOutputTokens: number,
  signal: AbortSignal,
  question: string,
  privateTerms: string[] = []
) {
  const steps: MeetGenerationStep[] = [];
  const sources: Array<{ sourceType: 'url'; url: string; title?: string }> = [];
  let searched = false;
  return {
    steps,
    sources,
    tool: tool({
      description:
        'Search Google for the requester’s explicit public question. No chat-history search or custom query is accepted. One request per answer.',
      inputSchema: z.object({}),
      execute: async () => {
        const query = question
          .replace(/@(tuturuuu|ttr)\b/giu, '')
          .trim()
          .slice(0, 2000);
        const normalize = (value: string) =>
          value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
        const words = new Set(normalize(query).split(/[^\p{L}\p{N}]+/u));
        const privateWords = privateTerms
          .flatMap((term) => normalize(term).split(/[^\p{L}\p{N}]+/u))
          .filter((word) => word.length >= 3);
        if (!query || privateWords.some((word) => words.has(word)))
          return {
            error:
              'Search omitted because this question contains a participant name or room detail. Ask a public question without private meeting information.',
          };
        if (searched)
          return {
            error:
              'Search limit reached for this answer. Ask a follow-up for another search.',
          };
        searched = true;
        const result = await generateText({
          model,
          tools: createGoogleSearchToolSet(),
          prompt: `Search the public web for this query and answer with cited sources: ${JSON.stringify(query)}`,
          maxOutputTokens,
          maxRetries: 0,
          abortSignal: signal,
        });
        steps.push(...result.steps);
        sources.push(
          ...result.sources.filter((source) => source.sourceType === 'url')
        );
        if (!sources.length)
          return {
            error:
              'Google did not return grounded sources for this question. No verified web answer is available.',
          };
        return { answer: result.text, sources };
      },
    }),
  };
}

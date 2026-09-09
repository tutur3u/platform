import { generateText, type LanguageModel, tool } from 'ai';
import { z } from 'zod';
import { createGoogleSearchToolSet } from '../tools/google-search-tool';
import type { MeetGenerationStep } from './chat-generation-usage';

/** Gemini 2 cannot mix native search and function tools in one request. */
export function legacyMeetSearch(
  model: LanguageModel,
  maxOutputTokens: number,
  signal: AbortSignal
) {
  const steps: MeetGenerationStep[] = [];
  const sources: Array<{ sourceType: 'url'; url: string; title?: string }> = [];
  let searched = false;
  return {
    steps,
    sources,
    tool: tool({
      description:
        'Search Google for current public facts. Use a concise public query, without private chat or workspace data. One search request per answer.',
      inputSchema: z.object({ query: z.string().trim().min(1).max(500) }),
      execute: async ({ query }) => {
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
        return { answer: result.text, sources };
      },
    }),
  };
}

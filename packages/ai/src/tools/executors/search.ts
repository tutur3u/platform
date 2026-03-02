import { google } from '@ai-sdk/google';
import { gateway, generateText, stepCountIs } from 'ai';
import { z } from 'zod';
import type { MiraToolContext } from '../mira-tools';

const SEARCH_WRAPPER_MODEL = 'google/gemini-2.5-flash-lite';

type SearchSource = {
  sourceId?: string;
  title?: string;
  url?: string;
};

type ToolStepLike = {
  toolCalls?: Array<{ toolName?: string }>;
  toolResults?: Array<{ toolName?: string }>;
};

const SearchArgsSchema = z.object({
  query: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, {
      message: 'Missing required `query`.',
    })
    .transform((value) => value.slice(0, 500)),
});

function hasGoogleSearchCallInSteps(steps: unknown): boolean {
  if (!Array.isArray(steps)) return false;

  return steps.some((step) => {
    if (!step || typeof step !== 'object') return false;
    const typedStep = step as ToolStepLike;
    const called = (typedStep.toolCalls ?? []).some(
      (toolCall) => toolCall.toolName === 'google_search'
    );
    const hasResult = (typedStep.toolResults ?? []).some(
      (toolResult) => toolResult.toolName === 'google_search'
    );
    return called || hasResult;
  });
}

function normalizeSources(value: unknown): SearchSource[] {
  if (!Array.isArray(value)) return [];

  const normalized: SearchSource[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;

    const source = item as Record<string, unknown>;
    const sourceId =
      typeof source.sourceId === 'string' ? source.sourceId : undefined;
    const title = typeof source.title === 'string' ? source.title : undefined;
    const url = typeof source.url === 'string' ? source.url : undefined;

    if (!sourceId && !title && !url) continue;

    normalized.push({ sourceId, title, url });
  }

  return normalized;
}

async function runGoogleSearchWrapper(query: string, forceTool: boolean) {
  const prompt = forceTool
    ? `You must call the google_search tool before producing the final answer.\nSearch the web for the query below and provide an accurate, concise answer with key points and cited sources.\n\nQuery: ${query}`
    : `Search the web for the query below and provide an accurate, concise answer with key points and cited sources.\n\nQuery: ${query}`;

  return generateText({
    model: gateway(SEARCH_WRAPPER_MODEL),
    tools: {
      google_search: google.tools.googleSearch({}),
    },
    prompt,
    stopWhen: stepCountIs(4),
    ...(forceTool ? { toolChoice: 'required' as const } : {}),
  });
}

export async function executeGoogleSearch(
  args: Record<string, unknown>,
  _ctx: MiraToolContext
) {
  void _ctx;
  const parsed = SearchArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid `query`.',
    };
  }

  const { query } = parsed.data;

  try {
    let result = await runGoogleSearchWrapper(query, false);
    let sources = normalizeSources((result as { sources?: unknown }).sources);
    let wasToolCalled = hasGoogleSearchCallInSteps(
      (result as { steps?: unknown }).steps
    );

    if (!wasToolCalled) {
      result = await runGoogleSearchWrapper(query, true);
      sources = normalizeSources((result as { sources?: unknown }).sources);
      wasToolCalled = hasGoogleSearchCallInSteps(
        (result as { steps?: unknown }).steps
      );
    }

    if (!wasToolCalled && sources.length === 0) {
      return {
        ok: false,
        query,
        error: 'Failed to invoke google_search tool for web-grounded results.',
      };
    }

    return {
      ok: true,
      query,
      answer: result.text,
      sources,
      sourceCount: sources.length,
    };
  } catch (error) {
    console.error('executeGoogleSearch provider error:', error);
    return {
      ok: false,
      query,
      error: 'Search provider error. Please try again.',
    };
  }
}

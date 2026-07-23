import { google } from '@ai-sdk/google';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const PeriodicReportNarrativeSchema = z.object({
  content: z
    .string()
    .describe('A concise, evidence-based report narrative in Markdown.'),
  feedback: z
    .string()
    .describe('Specific, constructive next steps for the report subject.'),
  title: z.string().describe('A short human-friendly report title.'),
});

export interface PeriodicReportGenerationContext {
  cadence: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  deterministicMetrics: Record<string, unknown>;
  group: { id: string; name: string | null };
  managerInstruction: string | null;
  periodEnd: string;
  periodStart: string;
  previousReport: {
    content: string;
    feedback: string;
    periodEnd: string | null;
    title: string;
  } | null;
  subject: {
    displayName: string | null;
    fullName: string | null;
    note: string | null;
  };
}

export type PeriodicReportNarrative = z.infer<
  typeof PeriodicReportNarrativeSchema
>;

export function buildPeriodicReportPrompt(
  context: PeriodicReportGenerationContext
) {
  return [
    'Write a periodic progress report using only the scoped context below.',
    'Never invent facts, compare the subject to unrelated people, or reveal another user.',
    'Keep deterministic metrics separate from interpretation and call out missing evidence.',
    'The output is a reviewable draft and will not be sent without manager approval.',
    '',
    JSON.stringify(context, null, 2),
  ].join('\n');
}

export async function generatePeriodicReportNarrative(
  context: PeriodicReportGenerationContext
) {
  const result = await generateText({
    model: google('gemini-3.1-flash-lite'),
    output: Output.object({ schema: PeriodicReportNarrativeSchema }),
    prompt: buildPeriodicReportPrompt(context),
    system:
      'You are a careful workspace reporting assistant. Produce neutral, useful reports grounded only in provided evidence.',
  });

  return result.output;
}

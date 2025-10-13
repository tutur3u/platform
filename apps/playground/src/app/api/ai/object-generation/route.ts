import { google } from '@ai-sdk/google';
import { generateObject } from '@tuturuuu/ai/core';
import { NextResponse } from 'next/server';
import z from 'zod';

const systemPrompt =
  "If the user needs to do something, it's a task, otherwise, smartly classify it as a note, transaction, document, or time-tracking. If the user didn't do it yet, it's not time tracking, it's a task. Always provide internalReasoning explaining why you classified it that way.";

const prompt =
  "I need to do 5 hours of coding today on implementing Vercel AI SDK and note down that I've worked 2 hours on researching it.";

const schema = z.object({
  tasks: z.array(
    z.object({
      internalReasoning: z.string().min(10).max(1000),
      name: z.string().min(2).max(100),
      description: z.string().max(500).optional(),
      type: z
        .enum(['task', 'note', 'transaction', 'document', 'time-tracking'])
        .optional(),
    })
  ),
});

export const GET = async () => {
  if (!prompt) return NextResponse.json({ tasks: [] });

  const tasks = await generateObject({
    model: google('gemini-2.5-flash-lite'),
    schema,
    prompt,
    system: systemPrompt,
  });

  return NextResponse.json(tasks.object);
};

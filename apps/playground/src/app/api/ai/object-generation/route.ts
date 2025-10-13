import { google } from '@ai-sdk/google';
import { generateObject } from '@tuturuuu/ai/core';
import { NextResponse } from 'next/server';
import z from 'zod';

const prompt = '';

const schema = z.object({
  tasks: z.array(
    z.object({
      name: z.string().min(2).max(100),
      description: z.string().max(500).optional(),
    })
  ),
});

export const GET = async () => {
  if (!prompt) return NextResponse.json({ tasks: [] });

  const tasks = await generateObject({
    model: google('gemini-2.5-flash-lite'),
    schema,
    prompt,
  });

  return NextResponse.json(tasks.object);
};

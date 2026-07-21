import { google } from '@ai-sdk/google';
import { withAiMemory } from '@tuturuuu/ai/memory';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { streamText } from 'ai';
import { z } from 'zod';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

const requestSchema = z.object({
  enMessages: z.record(z.string(), z.unknown()),
  viMessages: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  const auth = await authorizeInfrastructureAdminRequest();
  if (!auth.ok) return auth.response;

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { message: 'English messages are required' },
      { status: 400 }
    );
  }

  const { enMessages, viMessages = {} } = parsed.data;
  const jsonSize = JSON.stringify(enMessages).length;
  if (jsonSize > 100_000) {
    return Response.json(
      {
        message: 'Translation file too large',
        size: jsonSize,
        suggestion: 'Please translate in smaller sections (e.g., by namespace)',
      },
      { status: 413 }
    );
  }

  const prompt = `You are a professional translator. Translate the English text to Vietnamese while preserving the exact JSON structure.

IMPORTANT INSTRUCTIONS:
1. Maintain the exact structure and key ordering as the English JSON.
2. Keep existing Vietnamese translations unchanged.
3. Translate only missing or outdated values.
4. Preserve special characters, variables, and HTML tags.
5. Use professional, natural Vietnamese with the same tone.
6. Do not add or remove keys.
7. Return only valid JSON without markdown.

English JSON:
${JSON.stringify(enMessages, null, 2)}

Existing Vietnamese JSON:
${JSON.stringify(viMessages, null, 2)}`;

  try {
    const result = streamText({
      model: await withAiMemory({
        addMemory: 'never',
        customId: `translation-${Date.now()}`,
        model: google('gemini-3.1-flash-lite'),
        product: 'ai_chat',
        source: 'translation_admin_api',
        surface: 'translation_admin_api',
        userId: auth.user.id,
        wsId: ROOT_WORKSPACE_ID,
      }),
      prompt,
      temperature: 0.3,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = '';

        try {
          for await (const chunk of result.textStream) {
            fullText += chunk;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  accumulated: fullText.length,
                  content: chunk,
                  type: 'chunk',
                })}\n\n`
              )
            );
          }

          const cleaned = fullText
            .trim()
            .replace(/^```json\s*/, '')
            .replace(/^```\s*/, '')
            .replace(/\s*```$/, '');
          const match = cleaned.match(/\{[\s\S]*\}/);
          const translations = JSON.parse(match?.[0] ?? cleaned) as Record<
            string,
            unknown
          >;

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                translations,
                type: 'complete',
                usage: await result.usage,
              })}\n\n`
            )
          );
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                message:
                  error instanceof Error ? error.message : 'Translation failed',
                type: 'error',
              })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream',
      },
    });
  } catch (error) {
    console.error('Error in translation generation:', error);
    return Response.json(
      { error: 'Failed to generate translations' },
      { status: 500 }
    );
  }
}

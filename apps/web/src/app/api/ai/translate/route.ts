import { google } from '@ai-sdk/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { streamText } from 'ai';

export async function POST(req: Request) {
  try {
    // Get the current user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error('User is unauthenticated');
      return Response.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (!isValidTuturuuuEmail(user.email || '')) {
      console.error('User email is not authorized:', user.email);
      return Response.json(
        { message: 'Forbidden: Unauthorized email domain' },
        { status: 403 }
      );
    }

    const permissions = await getPermissions({
      wsId: ROOT_WORKSPACE_ID,
    });
    if (!permissions) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const { withoutPermission } = permissions;

    if (withoutPermission('manage_workspace_roles')) {
      console.error(
        'User lacks permission to manage workspace roles:',
        user.id
      );
      return Response.json(
        { message: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      );
    }

    const { enMessages, viMessages } = await req.json();

    if (!enMessages) {
      return Response.json(
        { message: 'English messages are required' },
        { status: 400 }
      );
    }

    // Calculate rough size - if too large, suggest using smaller sections
    const jsonSize = JSON.stringify(enMessages).length;
    if (jsonSize > 100000) {
      // ~100KB limit
      return Response.json(
        {
          message: 'Translation file too large',
          suggestion:
            'Please translate in smaller sections (e.g., by namespace)',
          size: jsonSize,
        },
        { status: 413 }
      );
    }

    // Create a prompt that instructs the AI to translate the English messages
    // while maintaining the existing Vietnamese translations
    const prompt = `You are a professional translator. Your task is to translate English text to Vietnamese while maintaining the exact JSON structure.

IMPORTANT INSTRUCTIONS:
1. Maintain the EXACT same structure and key ordering as the English JSON
2. If a Vietnamese translation already exists in the provided Vietnamese JSON, KEEP IT AS IS
3. Only translate keys that are missing in Vietnamese or need updating
4. Preserve all special characters, variables (like {name}, {{count}}, etc.), and HTML tags
5. Maintain professional and natural Vietnamese language
6. Keep the same tone and formality level as the English text
7. Do not add or remove any keys from the structure
8. Return ONLY valid JSON - no markdown code blocks, no explanations, just pure JSON

English JSON to translate:
${JSON.stringify(enMessages, null, 2)}

Existing Vietnamese translations (keep these if they exist):
${JSON.stringify(viMessages || {}, null, 2)}

Return ONLY a valid JSON object (not wrapped in any markdown or code blocks) with the complete Vietnamese translations, maintaining the exact same structure as the English JSON.`;

    const result = streamText({
      model: google('gemini-2.5-flash-lite'),
      prompt,
      temperature: 0.3, // Lower temperature for more consistent translations
    });

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = '';

        try {
          // Stream chunks back to client
          for await (const chunk of result.textStream) {
            fullText += chunk;

            // Send progress update
            const message = {
              type: 'chunk',
              content: chunk,
              accumulated: fullText.length,
            };

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(message)}\n\n`)
            );
          }

          // Parse final result
          let translations: Record<string, unknown>;
          let cleanedText = fullText.trim();

          // Remove markdown code block markers if present
          if (cleanedText.startsWith('```json')) {
            cleanedText = cleanedText
              .replace(/^```json\s*/, '')
              .replace(/\s*```$/, '');
          } else if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText
              .replace(/^```\s*/, '')
              .replace(/\s*```$/, '');
          }

          // Try to parse
          try {
            translations = JSON.parse(cleanedText);
          } catch (initialError) {
            const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              translations = JSON.parse(jsonMatch[0]);
            } else {
              throw initialError;
            }
          }

          const usage = await result.usage;

          // Send completion message
          const completeMessage = {
            type: 'complete',
            translations,
            usage,
          };

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(completeMessage)}\n\n`)
          );

          controller.close();
        } catch (error) {
          // Send error message
          const errorMessage = {
            type: 'error',
            message:
              error instanceof Error ? error.message : 'Translation failed',
          };

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`)
          );

          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in translation generation:', error);

    // Handle specific auth errors
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return Response.json({ error: 'Authentication failed' }, { status: 401 });
    }

    return new Response(
      JSON.stringify({ error: 'Failed to generate translations' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

import { createClient } from '@tuturuuu/supabase/next/server';
import { gateway, generateObject } from 'ai';
import { z } from 'zod';

const DEFAULT_MODEL_NAME = 'gemini-2.0-flash';

const transcriptSchema = z.object({
  text: z.string().describe('The full transcript text'),
  segments: z
    .array(
      z.object({
        text: z.string().describe('Text content of this segment'),
        start: z.number().describe('Start time in seconds'),
        end: z.number().describe('End time in seconds'),
      })
    )
    .optional()
    .describe('Array of transcript segments with timestamps'),
  language: z
    .string()
    .optional()
    .describe('Detected language code (e.g. "en", "vi")'),
  durationInSeconds: z
    .number()
    .optional()
    .describe('Total audio duration in seconds'),
});

export function createPOST() {
  return async function handler(req: Request) {
    try {
      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.error('Unauthorized');
        return new Response('Unauthorized', { status: 401 });
      }

      const formData = await req.formData();
      const audioFile = formData.get('audio') as File;

      if (!audioFile) {
        return new Response('No audio file provided', { status: 400 });
      }

      // Convert file to buffer
      const audioBuffer = await audioFile.arrayBuffer();
      const audioUint8Array = new Uint8Array(audioBuffer);

      const result = await generateObject({
        model: gateway(`google/${DEFAULT_MODEL_NAME}`),
        schema: transcriptSchema,
        system: systemInstruction,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'audio/mpeg',
                data: audioUint8Array,
              },
            ],
          },
        ],
        providerOptions: {
          google: {
            safetySettings: [
              {
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                threshold: 'BLOCK_NONE',
              },
              {
                category: 'HARM_CATEGORY_HATE_SPEECH',
                threshold: 'BLOCK_NONE',
              },
              {
                category: 'HARM_CATEGORY_HARASSMENT',
                threshold: 'BLOCK_NONE',
              },
              {
                category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                threshold: 'BLOCK_NONE',
              },
            ],
          },
        },
      });

      return new Response(
        JSON.stringify({
          text: result.object.text,
          segments: result.object.segments,
          language: result.object.language,
          durationInSeconds: result.object.durationInSeconds,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      console.error('Transcription error:', error);
      return new Response('Internal server error', { status: 500 });
    }
  };
}

const systemInstruction = `
  You are a helpful assistant that transcribes audio into structured text with timestamps.

  Please analyze the audio and provide:
  1. The complete transcript text
  2. If possible, break it into segments with start and end timestamps (in seconds)
  3. Detect the language used in the audio
  4. Estimate the total duration of the audio

  Return the result in the specified JSON schema format.
`;

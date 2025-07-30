import { ROOT_WORKSPACE_ID } from './../../../utils/src/constants';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type FinishReason, streamText } from 'ai';
import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

const DEFAULT_MODEL_NAME = 'gemini-2.5-flash';
const ALLOWED_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.0-pro',
  'gemini-2.5-pro',
] as const;

export function createPOST(
  options: { serverAPIKeyFallback?: boolean } = {
    serverAPIKeyFallback: false,
  }
) {
  // Higher-order function that returns the actual request handler
  return async function handler(req: NextRequest) {
    const sbAdmin = await createAdminClient();

    const {
      wsId = ROOT_WORKSPACE_ID,
      secretKey,
      model = DEFAULT_MODEL_NAME,
      prompt,
      systemPrompt,
    } = (await req.json()) as {
      wsId?: string;
      secretKey?: string;
      model?: (typeof ALLOWED_MODELS)[number];
      prompt?: string;
      systemPrompt?: string;
    };

    try {
      if (!secretKey) {
        console.error('Missing secret key');
        return new Response('Missing secret key', { status: 400 });
      }

      if (!prompt) {
        console.error('Missing prompt');
        return new Response('Missing prompt', { status: 400 });
      }

      const apiKey =
        (await cookies()).get('google_api_key')?.value ||
        (options.serverAPIKeyFallback
          ? process.env.GOOGLE_GENERATIVE_AI_API_KEY
          : undefined);

      if (!apiKey) {
        console.error('Missing API key');
        return new Response('Missing API key', { status: 400 });
      }

      if (!ALLOWED_MODELS.includes(model)) {
        console.error('Invalid model');
        return new Response(
          `Invalid model, allowed models: ${ALLOWED_MODELS.join(', ')}`,
          { status: 400 }
        );
      }

      const { data: apiKeyData, error: apiKeyError } = await sbAdmin
        .from('workspace_api_keys')
        .select('id')
        .eq('ws_id', wsId)
        .eq('value', secretKey)
        .in('scopes', [[model]])
        .single();

      if (apiKeyError) {
        console.error('Invalid secret key');
        return new Response('Invalid secret key', { status: 400 });
      }

      const google = createGoogleGenerativeAI({
        apiKey: apiKey,
      });

      let result: {
        input: string;
        output: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        usage: any;
        finishReason: FinishReason;
      } | null = null;

      const stream = streamText({
        model: google(model),
        prompt,
        system: systemPrompt,
        onFinish: async ({ text, finishReason, usage }) => {
          result = {
            input: prompt,
            output: text,
            usage,
            finishReason,
          };

          const insertData = {
            ws_id: wsId,
            api_key: apiKeyData.id,
            input: prompt,
            output: text,
            finish_reason: String(finishReason),
            input_tokens: usage.inputTokens ?? 0,
            output_tokens: usage.outputTokens ?? 0,
            reasoning_tokens: usage.reasoningTokens ?? 0,
            total_tokens: usage.totalTokens ?? 0,
            system_prompt: systemPrompt ?? '',
          };

          const { error: saveError } = await sbAdmin
            .from('workspace_ai_executions')
            .insert(insertData);

          if (saveError) {
            console.error('Error saving AI execution');
            console.error(saveError);
          }
        },
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

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of stream.textStream) {
        // console.log(textPart);
      }

      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof Error) {
        console.log(error.message);
        return NextResponse.json(
          {
            message: `## Edge API Failure\nCould not complete the request. Please view the **Stack trace** below.\n\`\`\`bash\n${error instanceof Error ? error.stack : 'Unknown error'}`,
          },
          {
            status: 500,
          }
        );
      }
      console.log(error);
    }
  };
}

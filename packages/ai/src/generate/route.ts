import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { type FinishReason, gateway, streamText } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';

const DEFAULT_MODEL_NAME = 'gemini-2.0-flash';

const ALLOWED_MODELS = [
  {
    name: 'gemini-2.0-flash',
    price: {
      per1MInputTokens: 0.1,
      per1MOutputTokens: 0.4,
      per1MReasoningTokens: 0.4,
    },
  },
  {
    name: 'gemini-2.0-flash-lite',
    price: {
      per1MInputTokens: 0.075,
      per1MOutputTokens: 0.3,
      per1MReasoningTokens: 0.3,
    },
  },
  {
    name: 'gemini-2.5-flash',
    price: {
      per1MInputTokens: 0.3,
      per1MOutputTokens: 2.5,
      per1MReasoningTokens: 2.5,
    },
  },
  {
    name: 'gemini-2.5-flash-lite',
    price: {
      per1MInputTokens: 0.1,
      per1MOutputTokens: 0.4,
      per1MReasoningTokens: 0.4,
    },
  },
  {
    name: 'gemini-2.5-pro',
    price: {
      per1MInputTokens: 1.25,
      per1MOutputTokens: 10,
      per1MReasoningTokens: 10,
    },
  },
] as const satisfies {
  name: string;
  price: {
    per1MInputTokens: number;
    per1MOutputTokens: number;
    per1MReasoningTokens: number;
  };
}[];

export function createPOST(
  _options: { serverAPIKeyFallback?: boolean } = {
    serverAPIKeyFallback: false,
  }
) {
  // Higher-order function that returns the actual request handler
  return async function handler(req: NextRequest): Promise<Response> {
    const sbAdmin = await createAdminClient();

    const {
      prompt,
      accessKey,
      configs = {
        wsId: ROOT_WORKSPACE_ID,
        model: DEFAULT_MODEL_NAME,
        systemPrompt: '',
        thinkingBudget: 0,
        includeThoughts: false,
      },
    } = (await req.json()) as {
      prompt?: string;
      dataType?: 'text' | 'file' | 'image';
      mimeType?: string;
      accessKey?: {
        id: string;
        value: string;
      };
      configs?: {
        wsId: string;
        model: (typeof ALLOWED_MODELS)[number]['name'];
        systemPrompt?: string;
        thinkingBudget?: number;
        includeThoughts?: boolean;
      };
    };

    if (!configs?.wsId) {
      configs.wsId = ROOT_WORKSPACE_ID;
    }
    if (!configs?.model) {
      configs.model = DEFAULT_MODEL_NAME;
    }

    if (!configs?.systemPrompt) {
      configs.systemPrompt = '';
    }

    if (!configs?.thinkingBudget) {
      configs.thinkingBudget = 0;
    }

    if (!configs?.includeThoughts) {
      configs.includeThoughts = false;
    }

    try {
      if (!accessKey?.id || !accessKey?.value) {
        console.error('Missing accessId or accessKey');
        return new Response('Missing accessId or accessKey', { status: 400 });
      }

      if (!prompt) {
        console.error('Missing prompt');
        return new Response('Missing prompt', { status: 400 });
      }

      // Pre-flight AI credit check (no userId available for API key auth)
      const creditCheck = await checkAiCredits(
        configs.wsId,
        configs.model,
        'generate'
      );
      if (!creditCheck.allowed) {
        return NextResponse.json(
          {
            error: creditCheck.errorMessage || 'AI credits insufficient',
            code: creditCheck.errorCode,
          },
          { status: 403 }
        );
      }

      if (!configs?.model) {
        console.error('Missing model');
        return new Response('Missing model', { status: 400 });
      }

      if (!ALLOWED_MODELS.some((model) => model.name === configs.model)) {
        console.error('Invalid model');
        return new Response(
          `Invalid model: ${configs.model}\nAllowed models: ${ALLOWED_MODELS.join(', ')}`,
          { status: 400 }
        );
      }

      if (!configs.wsId) {
        console.error('Missing workspace ID');
        return new Response('Missing workspace ID', { status: 400 });
      }

      const { data: apiKeyData, error: apiKeyError } = await sbAdmin
        .from('workspace_api_keys')
        .select('id, scopes')
        .eq('ws_id', configs.wsId)
        .eq('id', accessKey.id)
        .eq('value', accessKey.value)
        .single();

      if (apiKeyError) {
        console.error('Invalid accessId or accessKey', apiKeyError);
        return new Response('Invalid accessId or accessKey', { status: 400 });
      }

      if (!apiKeyData.scopes.includes(configs.model)) {
        console.error('Invalid model');
        return new Response(
          `Invalid model: ${configs.model}\nAllowed models: ${apiKeyData.scopes.join(', ')}`,
          { status: 400 }
        );
      }

      const apiKeyId = apiKeyData.id;

      let result: {
        input: string;
        output: string;
        usage: {
          inputTokens: number;
          outputTokens: number;
          reasoningTokens: number;
          totalTokens: number;
        };
        finishReason: FinishReason;
      } | null = null;

      const stream = streamText({
        model: gateway(`google/${configs.model}`),
        prompt,
        system: configs.systemPrompt,
        ...(creditCheck.maxOutputTokens
          ? { maxOutputTokens: creditCheck.maxOutputTokens }
          : {}),
        onFinish: async ({ text, finishReason, usage }) => {
          result = {
            input: prompt,
            output: text,
            usage: {
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              reasoningTokens: usage.reasoningTokens ?? 0,
              totalTokens: usage.totalTokens ?? 0,
            },
            finishReason,
          };

          const insertData = {
            ws_id: configs.wsId,
            api_key_id: apiKeyId,
            model_id: configs.model,
            input: prompt,
            output: text,
            finish_reason: String(finishReason),
            input_tokens: usage.inputTokens ?? 0,
            output_tokens: usage.outputTokens ?? 0,
            reasoning_tokens: usage.reasoningTokens ?? 0,
            total_tokens: usage.totalTokens ?? 0,
            system_prompt: configs.systemPrompt ?? '',
          };

          const { data: execData, error: saveError } = await sbAdmin
            .from('workspace_ai_executions')
            .insert(insertData)
            .select('id')
            .single();

          if (saveError) {
            console.error('Error saving AI execution');
            console.error(saveError);
          }

          // Deduct AI credits (no userId for API key auth)
          deductAiCredits({
            wsId: configs.wsId,
            modelId: configs.model,
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
            reasoningTokens:
              usage.outputTokenDetails?.reasoningTokens ??
              usage.reasoningTokens ??
              0,
            feature: 'generate',
            executionId: execData?.id,
          }).catch((err) => console.error('Failed to deduct AI credits:', err));
        },
        providerOptions: {
          google: {
            responseModalities: ['TEXT'],
            thinkingConfig: {
              thinkingBudget: configs.thinkingBudget ?? 0,
              includeThoughts: configs.includeThoughts ?? false,
            },
          },
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of stream.textStream) {
        // console.log(textPart);
      }

      // Calculate the cost of the request
      const model = ALLOWED_MODELS.find(
        (model) => model.name === configs.model
      );
      if (!model) {
        console.error('Invalid model');
        return new Response('Invalid model', { status: 400 });
      }

      if (!result) {
        console.error('No result');
        return new Response('No result', { status: 400 });
      }

      const typedResult = result as {
        input: string;
        output: string;
        usage: {
          inputTokens: number;
          outputTokens: number;
          reasoningTokens: number;
          totalTokens: number;
        };
        finishReason: FinishReason;
      };

      const cost = {
        inputCost:
          (typedResult.usage.inputTokens / 1_000_000) *
          model.price.per1MInputTokens,
        outputCost:
          (typedResult.usage.outputTokens / 1_000_000) *
          model.price.per1MOutputTokens,
        reasoningCost:
          (typedResult.usage.reasoningTokens / 1_000_000) *
          model.price.per1MReasoningTokens,
      };

      const totalCostUSD =
        cost.inputCost + cost.outputCost + cost.reasoningCost;

      // Fetch dynamic USD→VND exchange rate via DB function, fallback to 26000
      let exchangeRate = 26000;
      try {
        const { data: rate } = await sbAdmin.rpc('get_exchange_rate', {
          p_from_currency: 'USD',
          p_to_currency: 'VND',
        });
        if (rate && Number(rate) > 0) {
          exchangeRate = Number(rate);
        }
      } catch {
        // Use fallback rate
      }
      const totalCostVND = totalCostUSD * exchangeRate;

      // Format VND cost: show up to 3 decimal places if under 1 VND, otherwise whole number
      const formattedVNDCost =
        totalCostVND < 1
          ? `${totalCostVND.toFixed(3)} VND`
          : `${totalCostVND.toFixed(0)} VND`;

      return NextResponse.json({
        ...typedResult,
        cost: {
          inputCost: `$${cost.inputCost.toFixed(8)}`,
          outputCost: `$${cost.outputCost.toFixed(8)}`,
          reasoningCost: `$${cost.reasoningCost.toFixed(8)}`,
          totalCost: `$${totalCostUSD.toFixed(8)}`,
          totalCostVND: formattedVNDCost,
        },
      });
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
      return new Response('Internal Server Error', { status: 500 });
    }
  };
}

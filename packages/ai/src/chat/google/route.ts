import { google } from '@ai-sdk/google';
import {
  createAdminClient,
  createClient,
  createDynamicClient,
} from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import {
  consumeStream,
  gateway,
  smoothStream,
  stepCountIs,
  streamText,
} from 'ai';
import { type NextRequest, NextResponse } from 'next/server';
import type { CreditSource as SharedCreditSource } from '../credit-source';
import {
  shouldForceGoogleSearchForLatestUserMessage,
  shouldForceRenderUiForLatestUserMessage,
  shouldForceWorkspaceMembersForLatestUserMessage,
  shouldPreferMarkdownTablesForLatestUserMessage,
  shouldResolveWorkspaceContextForLatestUserMessage,
} from '../mira-render-ui-policy';
import { ChatRequestBodySchema, mapToUIMessages } from './chat-request-schema';
import { systemInstruction } from './default-system-instruction';
import { prepareMiraToolStep } from './mira-step-preparation';
import {
  moveTempFilesToThread,
  resolveChatIdForUser,
} from './route-chat-resolution';
import { performCreditPreflight } from './route-credits';
import {
  persistLatestUserMessage,
  prepareProcessedMessages,
} from './route-message-preparation';
import { prepareMiraRuntime } from './route-mira-runtime';
import { persistAssistantResponse } from './stream-finish-persistence';

const DEFAULT_MODEL_NAME = 'google/gemini-2.5-flash';
type ThinkingMode = 'fast' | 'thinking';
export function createPOST(
  _options: {
    serverAPIKeyFallback?: boolean;
    /** Gateway provider prefix for bare model names (e.g., 'openai', 'anthropic', 'vertex'). Defaults to 'google'. */
    defaultProvider?: string;
  } = {}
) {
  const defaultProvider = _options.defaultProvider ?? 'google';

  // Higher-order function that returns the actual request handler
  return async function handler(req: NextRequest): Promise<Response> {
    try {
      const sbAdmin = await createAdminClient();
      let requestBody: unknown;
      try {
        requestBody = await req.json();
      } catch (error) {
        return NextResponse.json(
          {
            error: 'Invalid JSON payload',
            message:
              error instanceof Error ? error.message : 'Malformed JSON body',
          },
          { status: 400 }
        );
      }

      const parsedBody = ChatRequestBodySchema.safeParse(requestBody);
      if (!parsedBody.success) {
        return NextResponse.json(
          {
            error: 'Invalid request body',
            issues: parsedBody.error.issues,
          },
          { status: 400 }
        );
      }

      const {
        id,
        model = DEFAULT_MODEL_NAME,
        messages,
        wsId,
        workspaceContextId,
        isMiraMode,
        timezone,
        thinkingMode: rawThinkingMode,
        creditSource: requestedCreditSourceRaw,
        creditWsId: rawCreditWsId,
      } = parsedBody.data;
      const thinkingMode: ThinkingMode =
        rawThinkingMode === 'thinking' ? 'thinking' : 'fast';

      // Normalize to gateway format for validation
      const gatewayModel = model.includes('/')
        ? model
        : `${defaultProvider}/${model}`;

      // Validate model exists in gateway models table
      const { data: gatewayModelRow, error: gatewayModelError } = await sbAdmin
        .from('ai_gateway_models')
        .select('id')
        .eq('id', gatewayModel)
        .eq('is_enabled', true)
        .maybeSingle();

      if (gatewayModelError) {
        console.error(
          '[AI Chat] Error checking gateway model:',
          gatewayModelError.message
        );
        return NextResponse.json(
          { error: 'Internal error validating model' },
          { status: 500 }
        );
      }

      if (!gatewayModelRow) {
        console.warn(
          `[AI Chat] Rejected unknown model: "${model}" (resolved: "${gatewayModel}")`
        );
        return NextResponse.json(
          {
            error: 'Invalid model',
            message: `Model "${model}" is not available.`,
          },
          { status: 400 }
        );
      }

      if (!messages) {
        console.error('Missing messages');
        return new Response('Missing messages', { status: 400 });
      }

      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.error('Unauthorized');
        return new Response('Unauthorized', { status: 401 });
      }

      // Normalize both workspace identifiers so slugs like 'personal' resolve to UUIDs.
      let normalizedWsId: string | null = null;
      let requestedCreditWsId: string | undefined;
      try {
        normalizedWsId = wsId ? await normalizeWorkspaceId(wsId) : null;
        requestedCreditWsId = rawCreditWsId
          ? await normalizeWorkspaceId(rawCreditWsId)
          : undefined;
      } catch (normError) {
        console.error(
          'Workspace ID normalization failed:',
          normError instanceof Error ? normError.message : normError
        );
        return NextResponse.json(
          { error: 'Invalid workspace identifier' },
          { status: 422 }
        );
      }

      if (normalizedWsId) {
        const { data: contextMembership, error: contextMembershipError } =
          await sbAdmin
            .from('workspace_members')
            .select('user_id')
            .eq('ws_id', normalizedWsId)
            .eq('user_id', user.id)
            .maybeSingle();

        if (contextMembershipError) {
          console.error(
            'DB error checking workspace membership:',
            contextMembershipError.message
          );
          return NextResponse.json(
            { error: 'Internal error verifying workspace access' },
            { status: 500 }
          );
        }

        if (!contextMembership) {
          return NextResponse.json(
            { error: 'Workspace access denied' },
            { status: 403 }
          );
        }
      }

      const requestedCreditSource: SharedCreditSource =
        requestedCreditSourceRaw ?? 'workspace';
      let billingWsId: string | null = normalizedWsId ?? null;

      if (requestedCreditSource === 'personal') {
        const { data: personalWorkspace, error: personalWorkspaceError } =
          await sbAdmin
            .from('workspaces')
            .select('id, workspace_members!inner(user_id)')
            .eq('personal', true)
            .eq('workspace_members.user_id', user.id)
            .maybeSingle();

        if (personalWorkspaceError) {
          console.error(
            'DB error looking up personal workspace:',
            personalWorkspaceError.message
          );
          return NextResponse.json(
            { error: 'Internal error resolving personal workspace' },
            { status: 500 }
          );
        }

        if (!personalWorkspace?.id) {
          return NextResponse.json(
            {
              error:
                'Personal workspace not found. Please ensure your account has a personal workspace.',
              code: 'PERSONAL_WORKSPACE_NOT_FOUND',
            },
            { status: 403 }
          );
        }

        if (
          requestedCreditWsId &&
          requestedCreditWsId !== personalWorkspace.id
        ) {
          return NextResponse.json(
            {
              error:
                'Invalid credit workspace for personal credit source selection.',
              code: 'INVALID_CREDIT_SOURCE',
            },
            { status: 403 }
          );
        }

        billingWsId = personalWorkspace.id;
      } else if (requestedCreditWsId) {
        if (normalizedWsId && requestedCreditWsId !== normalizedWsId) {
          return NextResponse.json(
            {
              error: 'Invalid credit workspace for workspace source selection.',
              code: 'INVALID_CREDIT_SOURCE',
            },
            { status: 403 }
          );
        }

        if (!normalizedWsId) {
          const { data: billingMembership, error: billingMembershipError } =
            await sbAdmin
              .from('workspace_members')
              .select('user_id')
              .eq('ws_id', requestedCreditWsId)
              .eq('user_id', user.id)
              .maybeSingle();

          if (billingMembershipError) {
            console.error(
              'Failed to check billing workspace membership',
              billingMembershipError.message
            );
            return NextResponse.json(
              { error: 'Internal server error' },
              { status: 500 }
            );
          }

          if (!billingMembership) {
            return NextResponse.json(
              {
                error: 'Workspace access denied for selected credit workspace.',
                code: 'INVALID_CREDIT_SOURCE',
              },
              { status: 403 }
            );
          }

          billingWsId = requestedCreditWsId;
        }
      }

      const resolvedChatId = await resolveChatIdForUser(id, () =>
        sbAdmin
          .from('ai_chats')
          .select('id')
          .eq('creator_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
      );
      if ('error' in resolvedChatId) {
        return resolvedChatId.error;
      }
      const chatId = resolvedChatId.chatId;

      const sbDynamic = await createDynamicClient();
      const moveFilesError = await moveTempFilesToThread({
        loadThread: () =>
          supabase.from('ai_chat_messages').select('*').eq('chat_id', chatId),
        listFiles: (tempStoragePath) =>
          sbDynamic.storage.from('workspaces').list(tempStoragePath),
        moveFile: (fromPath, toPath) =>
          sbAdmin.storage.from('workspaces').move(fromPath, toPath),
        wsId: normalizedWsId ?? undefined,
        chatId,
        userId: user.id,
      });
      if (moveFilesError) {
        return moveFilesError;
      }

      const normalizedMessages = mapToUIMessages(messages);
      const preparedMessages = await prepareProcessedMessages(
        normalizedMessages,
        normalizedWsId ?? undefined,
        chatId
      );
      if ('error' in preparedMessages) {
        return preparedMessages.error;
      }
      const { processedMessages } = preparedMessages;

      const persistUserMessageError = await persistLatestUserMessage({
        processedMessages,
        chatId,
        insertChatMessage: (args) =>
          supabase.rpc('insert_ai_chat_message', args),
        source: isMiraMode ? 'Mira' : 'Rewise',
      });
      if (persistUserMessageError) {
        return persistUserMessageError;
      }

      const creditPreflight = await performCreditPreflight({
        wsId: billingWsId ?? normalizedWsId ?? undefined,
        model,
        userId: user.id,
        sbAdmin,
      });
      if ('error' in creditPreflight) {
        return creditPreflight.error;
      }
      const { cappedMaxOutput } = creditPreflight;

      // Mutable ref so the render_ui preprocessor can read current steps
      // at Zod-validation time (before the execute handler runs).
      const stepsRef: { current: unknown[] } = { current: [] };

      const { miraSystemPrompt, miraTools } = await prepareMiraRuntime({
        isMiraMode,
        wsId: normalizedWsId ?? undefined,
        workspaceContextId,
        creditWsId: billingWsId ?? normalizedWsId ?? undefined,
        request: req,
        userId: user.id,
        chatId,
        supabase,
        timezone,
        getSteps: () => stepsRef.current,
      });

      const effectiveSource = isMiraMode ? 'Mira' : 'Rewise';

      const resolvedGatewayModel = model.includes('/')
        ? gateway(model)
        : gateway(`${defaultProvider}/${model}`);

      // Reasoning mode: default to fast unless the client explicitly requests thinking.
      const modelLower = model.toLowerCase();
      const supportsThinking =
        modelLower.includes('gemini-2.5') || modelLower.includes('gemini-3');
      const thinkingConfig = supportsThinking
        ? thinkingMode === 'thinking'
          ? { thinkingConfig: { includeThoughts: true } }
          : {
              thinkingConfig: {
                thinkingBudget: 0,
                includeThoughts: false,
              },
            }
        : {};
      const forceRenderUi =
        shouldForceRenderUiForLatestUserMessage(processedMessages);
      const forceGoogleSearch =
        shouldForceGoogleSearchForLatestUserMessage(processedMessages);
      const preferMarkdownTables =
        shouldPreferMarkdownTablesForLatestUserMessage(processedMessages);
      const needsWorkspaceContextResolution =
        shouldResolveWorkspaceContextForLatestUserMessage(processedMessages);
      const needsWorkspaceMembersTool =
        shouldForceWorkspaceMembersForLatestUserMessage(processedMessages);

      // Provider-native Google Search tool for non-Mira mode.
      const googleSearchTool = {
        google_search: google.tools.googleSearch({}),
      };

      type PrepareStep = NonNullable<
        NonNullable<Parameters<typeof streamText>[0]>['prepareStep']
      >;
      const prepareStep: PrepareStep = ({ steps }) => {
        // Keep the mutable ref in sync so the render_ui preprocessor can
        // read current steps during Zod validation.
        stepsRef.current = steps;
        return prepareMiraToolStep({
          steps,
          forceGoogleSearch,
          forceRenderUi,
          needsWorkspaceContextResolution,
          needsWorkspaceMembersTool,
          preferMarkdownTables,
        });
      };

      const result = streamText({
        abortSignal: req.signal,
        experimental_transform: smoothStream(),
        model: resolvedGatewayModel,
        messages: processedMessages,
        system:
          isMiraMode && miraSystemPrompt ? miraSystemPrompt : systemInstruction,
        ...(cappedMaxOutput ? { maxOutputTokens: cappedMaxOutput } : {}),
        ...(miraTools
          ? {
              tools: { ...miraTools, ...googleSearchTool } as NonNullable<
                Parameters<typeof streamText>[0]
              >['tools'],
              stopWhen: stepCountIs(25),
              toolChoice: 'auto' as const,
              prepareStep: prepareStep as NonNullable<
                NonNullable<Parameters<typeof streamText>[0]>['prepareStep']
              >,
            }
          : {
              tools: googleSearchTool,
            }),
        providerOptions: {
          google: {
            ...thinkingConfig,
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
          vertex: {
            ...thinkingConfig,
            safetySettings: [
              {
                category: 'HARM_CATEGORY_HARASSMENT',
                threshold: 'BLOCK_NONE',
              },
              {
                category: 'HARM_CATEGORY_HATE_SPEECH',
                threshold: 'BLOCK_NONE',
              },
              {
                category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                threshold: 'BLOCK_NONE',
              },
              {
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                threshold: 'BLOCK_NONE',
              },
            ],
          },
          gateway: {
            order: ['vertex', 'google'],
            caching: 'auto',
          },
        },
        onFinish: async (response) =>
          persistAssistantResponse({
            response,
            sbAdmin,
            chatId,
            userId: user.id,
            model,
            effectiveSource,
            wsId: billingWsId ?? normalizedWsId ?? undefined,
          }),
      });

      // Per https://ai-sdk.dev/docs/advanced/stopping-streams: consumeSseStream ensures
      // the stream is consumed on abort so cleanup can run; use onFinish in toUIMessageStreamResponse
      // to handle isAborted when needed.
      return result.toUIMessageStreamResponse({
        consumeSseStream: consumeStream,
        sendReasoning: true,
        sendSources: true,
      });
    } catch (error) {
      if (error instanceof Error) {
        console.log(error.message);
        return NextResponse.json(
          {
            message: `## Edge API Failure\nCould not complete the request. Please view the **Stack trace** below.\n\`\`\`bash\n${error instanceof Error ? error.stack : 'Unknown error'}\n\`\`\``,
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

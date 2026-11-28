import { google } from '@ai-sdk/google';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type LanguageModel, stepCountIs, streamText } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';
import { normalizeStableModelId } from '../../credits/model-mapping';
import type { CreatePostOptions } from './create-post-options';
import { enforceAiDataConsent } from '../ai-data-consent';
import {
  PlanModelResolutionError,
  resolvePlanModel,
} from '../../credits/resolve-plan-model';
import { withAiMemory } from '../../memory';
import type { CreditSource as SharedCreditSource } from '../credit-source';
import { shouldUseDayOverviewForLatestUserMessage } from '../mira-day-overview-intent';
import { ChatRequestBodySchema, mapToUIMessages } from './chat-request-schema';
import { resolveChatTools } from './chat-tools';
import { systemInstruction } from './default-system-instruction';
import { miraImmediateFirstTextTransform } from './mira-first-token-stream';
import {
  buildMiraStepPolicyBase,
  prepareMiraToolStep,
} from './mira-step-preparation';
import { createGoogleChatProviderOptions } from './provider-options';
import { resolveChatReasoningSettings } from './reasoning-settings';
import {
  beginAiPersistenceRequest,
  createAiPersistenceFinisher,
  releaseAiPersistenceRequest,
} from './request-persistence-lease';
import {
  authorizeAiWorkspace,
  isInternalTuturuuuAiUser,
  resolveAiRouteAuth,
} from './route-auth';
import {
  moveTempFilesToThread,
  resolveChatIdForUser,
} from './route-chat-resolution';
import {
  createChatReservationSettlement,
  estimateProcessedMessagesInputTokens,
  hasExhaustedChatCreditBudget,
  performCreditPreflight,
} from './route-credits';
import {
  extractLatestUserMessageContent,
  mergeSystemInstructions,
  originalUserText,
  persistLatestUserMessage,
  persistRequestScopedUserMessage,
  prepareProcessedMessages,
} from './route-message-preparation';
import { prepareMiraRuntime } from './route-mira-runtime';
import {
  emptyServerTiming,
  type ServerTimingStage,
  withServerTiming,
} from './server-timing';
import { validateSubscriptionRoute } from './route-subscription-boundary';
import {
  buildAbortedStreamFinishResponse,
  persistAssistantResponse,
} from './stream-finish-persistence';
import { createPersistingSseStreamConsumer } from './stream-lifetime';

export function createPOST(_options: CreatePostOptions = {}) {
  const defaultProvider = _options.defaultProvider ?? 'google';

  return async function handler(req: NextRequest): Promise<Response> {
    let releaseClaimedPersistenceLease: (() => Promise<void>) | null = null;
    let releaseCreditReservation: (() => Promise<void>) | null = null;
    const serverTiming = emptyServerTiming();
    const stageStartedAt = () => performance.now();
    const recordStage = (stage: ServerTimingStage, startedAt: number) => {
      serverTiming[stage] += Math.max(0, performance.now() - startedAt);
    };
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
        model,
        messages,
        wsId,
        workspaceContextId,
        isMiraMode: requestedMiraMode,
        timezone,
        thinkingMode: rawThinkingMode,
        creditSource: requestedCreditSourceRaw,
        creditWsId: rawCreditWsId,
        observabilityContext,
        persistenceRequestId,
        taskBoardContext,
      } = parsedBody.data;
      const isMiraMode = _options.subscription ? false : requestedMiraMode;
      const subscriptionError = validateSubscriptionRoute(
        model,
        !!_options.subscription
      );
      if (subscriptionError) return subscriptionError;
      const thinkingMode = rawThinkingMode === 'thinking' ? 'thinking' : 'fast';

      if (!messages) {
        console.error('Missing messages');
        return new Response('Missing messages', { status: 400 });
      }

      const authStartedAt = stageStartedAt();
      const auth =
        (await _options.resolveAuth?.(req)) ?? (await resolveAiRouteAuth(req));
      if (!auth.ok) return auth.response;
      const { messageInsertMode = 'rpc', supabase, user } = auth;
      // Every native request to the Gemini route needs consent, Mira or not.
      if (!_options.subscription) {
        const consentRefusal = await enforceAiDataConsent(
          req,
          user.id,
          sbAdmin
        );
        if (consentRefusal) return consentRefusal;
      }
      let subscriptionModel: LanguageModel | undefined;
      if (_options.subscription) {
        try {
          subscriptionModel = await _options.subscription.resolveModel(
            user.id,
            model
          );
        } catch (error) {
          const failure = _options.subscription.errorResponse?.(error);
          return NextResponse.json(
            {
              error: failure?.message ?? _options.subscription.onError(),
              code: failure?.code ?? 'CHATGPT_CONNECTION_REQUIRED',
            },
            { status: failure?.status ?? 403 }
          );
        }
      }

      recordStage('auth', authStartedAt);

      const scopeStartedAt = stageStartedAt();
      let normalizedWsId: string | null = null;
      let requestedCreditWsId: string | undefined;
      if (!wsId && _options.requireWorkspaceId) {
        return NextResponse.json(
          { error: 'Invalid workspace identifier' },
          { status: 422 }
        );
      }

      if (wsId) {
        const workspaceAuthorization = await authorizeAiWorkspace({
          membershipClient: sbAdmin,
          request: req,
          supabase,
          userId: user.id,
          wsId,
        });
        if (!workspaceAuthorization.ok) {
          return workspaceAuthorization.response;
        }
        normalizedWsId = workspaceAuthorization.wsId;
      }

      try {
        requestedCreditWsId = rawCreditWsId
          ? await normalizeWorkspaceId(rawCreditWsId, supabase, req)
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

      const requestedCreditSource: SharedCreditSource =
        requestedCreditSourceRaw ?? 'workspace';
      let billingWsId: string | null = normalizedWsId ?? null;

      if (!_options.subscription && requestedCreditSource === 'personal') {
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
      } else if (!_options.subscription && requestedCreditWsId) {
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
          const billingMembership = await verifyWorkspaceMembershipType({
            wsId: requestedCreditWsId,
            userId: user.id,
            supabase: sbAdmin,
            requiredType: 'MEMBER',
          });

          if (billingMembership.error === 'membership_lookup_failed') {
            console.error('Failed to check billing workspace membership');
            return NextResponse.json(
              { error: 'Internal server error' },
              { status: 500 }
            );
          }

          if (!billingMembership.ok) {
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

      const modelResolutionPromise = (async (): Promise<
        { modelId: string } | { error: Response }
      > => {
        try {
          if (subscriptionModel && model) {
            return { modelId: model };
          }
          if (billingWsId) {
            const resolvedPlanModel = await resolvePlanModel({
              capability: 'language',
              requestedModel: model,
              wsId: billingWsId,
            });
            return { modelId: resolvedPlanModel.modelId };
          }
          if (model) {
            return {
              modelId: normalizeStableModelId(
                model.includes('/') ? model : `${defaultProvider}/${model}`
              ),
            };
          }
          return {
            error: NextResponse.json(
              {
                error:
                  'Model is required when billing workspace is unavailable.',
              },
              { status: 400 }
            ),
          };
        } catch (error) {
          if (error instanceof PlanModelResolutionError) {
            const status =
              error.code === 'WORKSPACE_ID_REQUIRED'
                ? 400
                : error.code === 'NO_ALLOCATION'
                  ? 503
                  : 500;
            const safeMessage =
              error.code === 'WORKSPACE_ID_REQUIRED'
                ? 'Workspace ID is required.'
                : error.code === 'NO_ALLOCATION'
                  ? 'AI credits are not enabled for this workspace plan.'
                  : 'Failed to resolve chat model.';
            return {
              error: NextResponse.json(
                { error: safeMessage, code: error.code },
                { status }
              ),
            };
          }

          console.error('Failed to resolve chat model:', error);
          return {
            error: NextResponse.json(
              { error: 'Failed to resolve chat model' },
              { status: 500 }
            ),
          };
        }
      })();
      const [modelResolution, resolvedChatId] = await Promise.all([
        modelResolutionPromise,
        resolveChatIdForUser(
          id,
          () =>
            sbAdmin
              .from('ai_chats')
              .select('id')
              .eq('creator_id', user.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single(),
          (chatId) =>
            sbAdmin
              .from('ai_chats')
              .select('id')
              .eq('id', chatId)
              .eq('creator_id', user.id)
              .maybeSingle()
        ),
      ]);
      recordStage('scope', scopeStartedAt);
      if ('error' in modelResolution) return modelResolution.error;
      if ('error' in resolvedChatId) return resolvedChatId.error;
      const resolvedModelId = modelResolution.modelId;
      const chatId = resolvedChatId.chatId;
      const moveFilesError = await moveTempFilesToThread({
        listFiles: (tempStoragePath) =>
          sbAdmin.storage.from('workspaces').list(tempStoragePath),
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
      const historyStartedAt = stageStartedAt();
      const preparedMessages = await prepareProcessedMessages(
        normalizedMessages,
        normalizedWsId ?? undefined,
        chatId,
        req,
        {
          actorId: user.id,
          excludeAudioVideoFiles: !!subscriptionModel,
          attachYoutubeVideoInput:
            resolvedModelId.toLowerCase().startsWith('google/') ||
            resolvedModelId.toLowerCase().startsWith('google-vertex/'),
        }
      );
      recordStage('history', historyStartedAt);
      if ('error' in preparedMessages) {
        return preparedMessages.error;
      }
      const { processedMessages } = preparedMessages;
      if (
        subscriptionModel &&
        processedMessages.some(
          (message) =>
            Array.isArray(message.content) &&
            message.content.some(
              (part) =>
                part.type === 'file' && /^(audio|video)\//.test(part.mediaType)
            )
        )
      ) {
        return NextResponse.json(
          {
            error:
              'ChatGPT plan sharing does not support audio or video inputs',
          },
          { status: 400 }
        );
      }

      const persistUserMessageError = await persistLatestUserMessage({
        processedMessages,
        chatId,
        insertChatMessage: async (args) => {
          if (messageInsertMode === 'direct' || persistenceRequestId) {
            if (!persistenceRequestId) {
              const { error } = await sbAdmin.from('ai_chat_messages').insert({
                chat_id: chatId,
                content: args.message,
                creator_id: user.id,
                metadata: { source: args.source },
                role: 'USER',
              });
              return { error };
            }
            return persistRequestScopedUserMessage({
              chatId,
              content: args.message,
              originalText: originalUserText(normalizedMessages),
              creatorId: user.id,
              findExistingMessage: async () => {
                const { data, error } = await sbAdmin
                  .from('ai_chat_messages')
                  .select('content,creator_id,metadata')
                  .eq('chat_id', chatId)
                  .eq('role', 'USER')
                  .contains('metadata', {
                    requestId: persistenceRequestId,
                    source: args.source,
                  })
                  .maybeSingle();
                return { data, error };
              },
              insertMessage: async (metadata) => {
                const { error } = await sbAdmin
                  .from('ai_chat_messages')
                  .insert({
                    chat_id: chatId,
                    content: args.message,
                    creator_id: user.id,
                    metadata,
                    role: 'USER',
                  });
                return { error };
              },
              requestId: persistenceRequestId,
              source: args.source,
            });
          }
          const { error } = await supabase.rpc(
            'insert_ai_chat_message' as never,
            args as never
          );
          return { error };
        },
        requestScoped: Boolean(persistenceRequestId),
        source: isMiraMode ? 'Mira' : 'Rewise',
      });
      if (persistUserMessageError) {
        return persistUserMessageError;
      }

      const creditsStartedAt = stageStartedAt();
      const creditPreflight = subscriptionModel
        ? { cappedMaxOutput: null, allowNativeSearch: false }
        : await performCreditPreflight({
            wsId: billingWsId ?? normalizedWsId ?? undefined,
            model: resolvedModelId,
            userId: user.id,
            sbAdmin,
            estimatedInputTokens:
              estimateProcessedMessagesInputTokens(processedMessages),
            reserveCredits: true,
            enableNativeSearch: !isMiraMode,
          });
      recordStage('credits', creditsStartedAt);
      if ('error' in creditPreflight) return creditPreflight.error;
      const { cappedMaxOutput } = creditPreflight;
      const reservationSettlement = createChatReservationSettlement({
        budget: creditPreflight,
        sbAdmin,
        wsId: billingWsId ?? normalizedWsId ?? undefined,
        userId: user.id,
        modelId: resolvedModelId,
        chargeKey: persistenceRequestId ?? undefined,
      });
      releaseCreditReservation = reservationSettlement.release;

      const stepsRef: { current: unknown[] } = { current: [] };
      const effectiveSource = isMiraMode ? 'Mira' : 'Rewise';
      const needsDayOverview =
        isMiraMode &&
        shouldUseDayOverviewForLatestUserMessage(processedMessages);
      const restrictToPersonalWorkspace = Boolean(
        isMiraMode &&
        !subscriptionModel &&
        creditPreflight.tier === 'FREE' &&
        !(await isInternalTuturuuuAiUser(auth))
      );
      // After the credit check: the memory consent read overlaps context.
      const contextStartedAt = stageStartedAt();
      const [miraRuntime, resolvedGatewayModel] = await Promise.all([
        prepareMiraRuntime({
          isMiraMode,
          wsId: normalizedWsId ?? undefined,
          workspaceContextId,
          creditWsId: billingWsId ?? normalizedWsId ?? undefined,
          request: req,
          user,
          userId: user.id,
          chatId,
          supabase,
          toolSupabase: sbAdmin as typeof supabase,
          timezone,
          taskBoardContext,
          clientCapabilities: parsedBody.data.clientCapabilities,
          getSteps: () => stepsRef.current,
          prefetchDayOverview: needsDayOverview,
          restrictToPersonalWorkspace,
        }).finally(() => recordStage('context', contextStartedAt)),
        subscriptionModel ??
          withAiMemory({
            customId: chatId,
            model: google(resolvedModelId.split('/').slice(-1)[0]!),
            product: isMiraMode ? 'mira' : 'rewise',
            source: effectiveSource,
            surface: 'shared_chat',
            userId: user.id,
            wsId: billingWsId ?? normalizedWsId,
          }).finally(() => recordStage('model-start', contextStartedAt)),
      ]);
      const { miraSystemPrompt, miraTools, prepareMiraDiscoveryStep } =
        miraRuntime;

      const reasoningSettings = resolveChatReasoningSettings(thinkingMode);
      const stepPolicyBase = buildMiraStepPolicyBase(
        processedMessages,
        Boolean(needsDayOverview)
      );
      type PrepareStep = NonNullable<
        NonNullable<Parameters<typeof streamText>[0]>['prepareStep']
      >;
      const prepareStep: PrepareStep = async ({ steps }) => {
        stepsRef.current = steps;
        const policy = prepareMiraToolStep({ ...stepPolicyBase, steps });
        return prepareMiraDiscoveryStep
          ? prepareMiraDiscoveryStep(policy)
          : policy;
      };

      const { lease: claimedLease, response: leaseResponse } =
        await beginAiPersistenceRequest({
          chatId,
          client: sbAdmin,
          content: extractLatestUserMessageContent(processedMessages),
          creatorId: user.id,
          requestId: persistenceRequestId,
          source: effectiveSource,
        });
      if (leaseResponse) {
        await releaseCreditReservation().catch(() => undefined);
        return leaseResponse;
      }
      if (claimedLease) {
        releaseClaimedPersistenceLease = async () => {
          await releaseAiPersistenceRequest(sbAdmin, claimedLease);
        };
      }

      const persistChatAssistantResponse = createAiPersistenceFinisher<
        Parameters<typeof persistAssistantResponse>[0]['response']
      >({
        client: sbAdmin,
        lease: claimedLease,
        onSettled: () => {
          releaseClaimedPersistenceLease = null;
          releaseCreditReservation = null;
        },
        persist: (response) =>
          persistAssistantResponse({
            response,
            sbAdmin,
            chatId,
            userId: user.id,
            model: resolvedModelId,
            effectiveSource,
            wsId: billingWsId ?? normalizedWsId ?? undefined,
            observabilityContext,
            skipCreditDeduction: !!subscriptionModel,
            settleCreditReservation: reservationSettlement.settle,
            persistenceRequestId,
          }).finally(() =>
            reservationSettlement.release().catch(() => undefined)
          ),
      });

      const streamStartedAt = stageStartedAt();
      const result = streamText({
        abortSignal: req.signal,
        experimental_transform: miraImmediateFirstTextTransform(),
        maxRetries: 0,
        model: resolvedGatewayModel,
        messages: processedMessages,
        reasoning: reasoningSettings.effort,
        system: mergeSystemInstructions(
          isMiraMode && miraSystemPrompt ? miraSystemPrompt : systemInstruction,
          _options.serverSystemInstructions ?? null
        ),
        ...(cappedMaxOutput ? { maxOutputTokens: cappedMaxOutput } : {}),
        tools: subscriptionModel
          ? undefined
          : resolveChatTools(miraTools, {
              allowNativeSearch: creditPreflight.allowNativeSearch,
            }),
        ...(miraTools
          ? {
              stopWhen: [
                stepCountIs(25),
                ({ steps }) =>
                  hasExhaustedChatCreditBudget(steps, creditPreflight),
              ],
              toolChoice: 'auto' as const,
              prepareStep,
            }
          : {}),
        providerOptions: subscriptionModel
          ? undefined
          : createGoogleChatProviderOptions(reasoningSettings.includeThoughts),
        onAbort: async ({ steps }) =>
          persistChatAssistantResponse(buildAbortedStreamFinishResponse(steps)),
        onFinish: persistChatAssistantResponse,
        timeout: { chunkMs: 20_000, stepMs: 45_000, totalMs: 120_000 },
      });

      // consumeSseStream keeps consuming after a client abort so onFinish/onAbort
      // persistence runs, and registers that work with the request's waitUntil.
      recordStage('model-start', streamStartedAt);
      return withServerTiming(
        result.toUIMessageStreamResponse({
          consumeSseStream: createPersistingSseStreamConsumer(),
          sendReasoning: true,
          sendSources: true,
          ...(_options.subscription
            ? { onError: _options.subscription.onError }
            : {}),
        }),
        serverTiming
      );
    } catch (error) {
      await releaseCreditReservation?.().catch(() => undefined);
      await releaseClaimedPersistenceLease?.().catch((releaseError) => {
        console.error('Failed to release AI persistence request lease.', {
          error: releaseError,
        });
      });
      if (_options.subscription) {
        console.error('ChatGPT request failed', {
          errorType: error instanceof Error ? error.name : 'UnknownError',
        });
        return NextResponse.json(
          { error: _options.subscription.onError() },
          { status: 502 }
        );
      }
      // Keep stack traces in server logs; never return them to the client.
      console.error('AI chat request failed', error);
      const safeError = 'Could not complete the request. Please try again.';
      return NextResponse.json(
        { error: safeError, message: safeError },
        { status: 500 }
      );
    }
  };
}

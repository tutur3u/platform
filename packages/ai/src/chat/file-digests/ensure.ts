import { runWithLock } from '@tuturuuu/utils/redis';
import { checkAiCredits, deductAiCredits } from '../../credits/check-credits';
import {
  getReadyChatFileDigest,
  saveFailedChatFileDigest,
  saveReadyChatFileDigest,
  upsertProcessingChatFileDigest,
} from './cache';
import { CHAT_FILE_DIGEST_VERSION, FILE_DIGEST_MODEL } from './constants';
import type {
  EnsureChatFileDigestParams,
  EnsureChatFileDigestResult,
} from './types';
import { digestChatFileWithGemini, resolveAttachmentForDigest } from './worker';

function resolveDisplayName(params: EnsureChatFileDigestParams): string {
  return params.attachment.alias || params.attachment.name;
}

export async function ensureChatFileDigest(
  params: EnsureChatFileDigestParams
): Promise<EnsureChatFileDigestResult> {
  const resolvedAttachment = await resolveAttachmentForDigest({
    attachment: params.attachment,
    chatId: params.chatId,
    creditWsId: params.creditWsId,
    userId: params.userId,
    wsId: params.wsId,
  });

  const billingWsId = params.creditWsId ?? params.wsId;
  const singleFlightKey = `digest:${billingWsId}:${params.userId}:${resolvedAttachment.storagePath}:${CHAT_FILE_DIGEST_VERSION}`;

  const existing = params.forceRefresh
    ? null
    : await getReadyChatFileDigest(
        resolvedAttachment.storagePath,
        CHAT_FILE_DIGEST_VERSION
      );

  if (existing) {
    return {
      ok: true,
      cached: true,
      digest: existing,
    };
  }

  const runDigest = async (): Promise<EnsureChatFileDigestResult> => {
    // Check again inside the lock to handle race conditions
    const innerExisting = params.forceRefresh
      ? null
      : await getReadyChatFileDigest(
          resolvedAttachment.storagePath,
          CHAT_FILE_DIGEST_VERSION
        );

    if (innerExisting) {
      return {
        ok: true,
        cached: true,
        digest: innerExisting,
      };
    }

    const displayName = resolveDisplayName(params);
    let effectiveAttachment = resolvedAttachment;

    try {
      const creditCheck = await checkAiCredits(
        billingWsId || undefined,
        FILE_DIGEST_MODEL,
        'chat',
        { userId: params.userId }
      );

      if (!creditCheck.allowed) {
        const error =
          creditCheck.errorMessage ||
          'Insufficient credits to analyze the attached file.';
        await saveFailedChatFileDigest({
          chatId: params.chatId,
          displayName,
          errorMessage: error,
          fileName: resolvedAttachment.name,
          mediaType: resolvedAttachment.type || 'application/octet-stream',
          messageId: params.messageId,
          processorModel: FILE_DIGEST_MODEL,
          size: resolvedAttachment.size,
          storagePath: resolvedAttachment.storagePath,
          wsId: params.wsId,
        });
        return {
          ok: false,
          cached: false,
          error,
        };
      }

      await upsertProcessingChatFileDigest({
        chatId: params.chatId,
        displayName,
        fileName: resolvedAttachment.name,
        mediaType: resolvedAttachment.type || 'application/octet-stream',
        messageId: params.messageId,
        processorModel: FILE_DIGEST_MODEL,
        size: resolvedAttachment.size,
        storagePath: resolvedAttachment.storagePath,
        wsId: params.wsId,
      });

      const digested = await digestChatFileWithGemini({
        attachmentResolved: true,
        attachment: resolvedAttachment,
        chatId: params.chatId,
        creditWsId: params.creditWsId,
        userId: params.userId,
        wsId: params.wsId,
      });
      effectiveAttachment = digested.resolvedAttachment ?? resolvedAttachment;

      const deduction = await deductAiCredits({
        chatMessageId: params.messageId ?? undefined,
        feature: 'chat',
        inputTokens: digested.usage.inputTokens,
        metadata: {
          digestVersion: CHAT_FILE_DIGEST_VERSION,
          source: 'chat_file_digest',
          storagePath: effectiveAttachment.storagePath,
        },
        modelId: FILE_DIGEST_MODEL,
        outputTokens: digested.usage.outputTokens,
        reasoningTokens: digested.usage.reasoningTokens,
        userId: params.userId,
        wsId: billingWsId || undefined,
      });

      if (!deduction.success) {
        const error =
          deduction.errorCode === 'CREDITS_EXHAUSTED'
            ? 'Insufficient credits to save the file digest.'
            : 'Failed to deduct AI credits for file digestion.';
        await saveFailedChatFileDigest({
          chatId: params.chatId,
          displayName,
          errorMessage: error,
          fileName: effectiveAttachment.name,
          mediaType: effectiveAttachment.type || 'application/octet-stream',
          messageId: params.messageId,
          processorModel: FILE_DIGEST_MODEL,
          size: effectiveAttachment.size,
          storagePath: effectiveAttachment.storagePath,
          wsId: params.wsId,
        });
        return {
          ok: false,
          cached: false,
          error,
        };
      }

      const savedDigest = await saveReadyChatFileDigest({
        answerContextMarkdown: digested.answerContextMarkdown,
        chatId: params.chatId,
        displayName,
        extractedMarkdown: digested.extractedMarkdown ?? null,
        fileName: effectiveAttachment.name,
        keyFacts: digested.keyFacts,
        limitations: digested.limitations,
        mediaType: effectiveAttachment.type || 'application/octet-stream',
        messageId: params.messageId,
        processorModel: FILE_DIGEST_MODEL,
        size: effectiveAttachment.size,
        storagePath: effectiveAttachment.storagePath,
        suggestedAlias: digested.suggestedAlias,
        summary: digested.summary,
        title: digested.title,
        wsId: params.wsId,
      });

      if (!savedDigest) {
        const error = 'Failed to persist the file digest.';
        await saveFailedChatFileDigest({
          chatId: params.chatId,
          displayName,
          errorMessage: error,
          fileName: effectiveAttachment.name,
          mediaType: effectiveAttachment.type || 'application/octet-stream',
          messageId: params.messageId,
          processorModel: FILE_DIGEST_MODEL,
          size: effectiveAttachment.size,
          storagePath: effectiveAttachment.storagePath,
          wsId: params.wsId,
        });
        return {
          ok: false,
          cached: false,
          error,
        };
      }

      return {
        ok: true,
        cached: false,
        digest: savedDigest,
        usage: digested.usage,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to analyze the attached file.';
      await saveFailedChatFileDigest({
        chatId: params.chatId,
        displayName,
        errorMessage: message,
        fileName: effectiveAttachment.name,
        mediaType: effectiveAttachment.type || 'application/octet-stream',
        messageId: params.messageId,
        processorModel: FILE_DIGEST_MODEL,
        size: effectiveAttachment.size,
        storagePath: effectiveAttachment.storagePath,
        wsId: params.wsId,
      });
      return {
        ok: false,
        cached: false,
        error: message,
      };
    }
  };

  const lockResult = await runWithLock(singleFlightKey, runDigest, {
    ttlSeconds: 300,
  });
  if (typeof lockResult === 'object' && 'locked' in lockResult) {
    return {
      ok: false,
      cached: false,
      error:
        'Conflict: Another digestion is already in progress for this file.',
    };
  }

  return lockResult;
}

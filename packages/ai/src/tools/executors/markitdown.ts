import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { normalizeChatAttachmentMetadata } from '../../chat/chat-attachment-metadata';
import {
  commitFixedAiCreditReservation,
  releaseFixedAiCreditReservation,
  reserveFixedAiCredits,
} from '../../credits/reservations';
import type { MiraToolContext } from '../mira-tools';

const MARKITDOWN_COST_CREDITS = 100;
const CREDIT_FEATURE = 'chat' as const;
const MARKITDOWN_LEDGER_MODEL = 'markitdown/conversion';
const DEFAULT_MARKITDOWN_TIMEOUT_MS = 30_000;
const MIN_MARKITDOWN_TIMEOUT_MS = 1_000;
const NATIVE_MULTIMODAL_EXTENSIONS = new Set([
  'aac',
  'flac',
  'jpeg',
  'jpg',
  'm4a',
  'mov',
  'mp3',
  'mp4',
  'ogg',
  'png',
  'wav',
  'webm',
  'webp',
]);

function stripTimestampPrefix(name: string): string {
  const match = name.match(/^\d+_(.+)$/);
  return match?.[1] ?? name;
}

function getFileExtension(name: string): string {
  const normalizedName = stripTimestampPrefix(name).toLowerCase();
  const lastDotIndex = normalizedName.lastIndexOf('.');
  if (lastDotIndex === -1) return '';
  return normalizedName.slice(lastDotIndex + 1);
}

function isNativeMultimodalFile(
  fileName: string,
  mediaType?: string | null
): boolean {
  if (
    typeof mediaType === 'string' &&
    (mediaType.startsWith('audio/') ||
      mediaType.startsWith('image/') ||
      mediaType.startsWith('video/'))
  ) {
    return true;
  }

  return NATIVE_MULTIMODAL_EXTENSIONS.has(getFileExtension(fileName));
}

function parseBaseUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    const isLocalhost =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

    // Require HTTPS, except for local testing
    if (
      parsed.protocol !== 'https:' &&
      !(isLocalhost && parsed.protocol === 'http:')
    ) {
      return null;
    }

    parsed.search = '';
    parsed.hash = '';
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function resolveDiscordMarkitdownUrl(): string | null {
  const deploymentUrl = process.env.DISCORD_APP_DEPLOYMENT_URL?.trim();
  if (!deploymentUrl) return null;
  const normalizedBaseUrl = parseBaseUrl(deploymentUrl);
  if (!normalizedBaseUrl) return null;
  return `${normalizedBaseUrl}/markitdown`;
}

function resolveDiscordMarkitdownSecret(): string | null {
  return (
    process.env.MARKITDOWN_ENDPOINT_SECRET?.trim() ||
    process.env.VERCEL_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    null
  );
}

function resolveMarkitdownTimeoutMs(): number {
  const rawTimeoutMs = process.env.MARKITDOWN_TIMEOUT_MS?.trim();
  if (!rawTimeoutMs) {
    return DEFAULT_MARKITDOWN_TIMEOUT_MS;
  }

  const parsedTimeoutMs = Number(rawTimeoutMs);
  if (!Number.isFinite(parsedTimeoutMs) || parsedTimeoutMs <= 0) {
    return DEFAULT_MARKITDOWN_TIMEOUT_MS;
  }

  return Math.max(MIN_MARKITDOWN_TIMEOUT_MS, Math.floor(parsedTimeoutMs));
}

async function reserveMarkitdownCredits(
  sbAdmin: { rpc: unknown },
  billingWsId: string,
  ctx: MiraToolContext,
  metadata: Record<string, unknown>
): Promise<
  | { ok: true; reservationId: string; remainingCredits: number }
  | { ok: false; error: string }
> {
  const result = await reserveFixedAiCredits(
    {
      wsId: billingWsId,
      userId: ctx.userId,
      amount: MARKITDOWN_COST_CREDITS,
      modelId: MARKITDOWN_LEDGER_MODEL,
      feature: CREDIT_FEATURE,
      metadata: {
        ...metadata,
        fixedCredits: MARKITDOWN_COST_CREDITS,
        source: 'markitdown_tool',
      },
    },
    sbAdmin
  );

  if (!result.success || !result.reservationId) {
    if (result.errorCode === 'INSUFFICIENT_CREDITS') {
      return {
        ok: false,
        error: `Insufficient credits. This conversion needs ${MARKITDOWN_COST_CREDITS} credits.`,
      };
    }
    return { ok: false, error: 'Failed to reserve AI credits.' };
  }

  return {
    ok: true,
    reservationId: result.reservationId,
    remainingCredits: result.remainingCredits,
  };
}

async function commitMarkitdownCredits(
  sbAdmin: { rpc: unknown },
  reservationId: string,
  metadata: Record<string, unknown>
): Promise<
  { ok: true; remainingCredits: number } | { ok: false; error: string }
> {
  const result = await commitFixedAiCreditReservation(
    reservationId,
    {
      ...metadata,
      fixedCredits: MARKITDOWN_COST_CREDITS,
      source: 'markitdown_tool',
    },
    sbAdmin
  );

  if (!result.success) {
    if (result.errorCode === 'RESERVATION_EXPIRED') {
      return {
        ok: false,
        error:
          'AI credit reservation expired before the conversion could be completed.',
      };
    }
    return { ok: false, error: 'Failed to deduct AI credits.' };
  }

  return {
    ok: true,
    remainingCredits: result.remainingCredits,
  };
}

async function releaseMarkitdownCredits(
  sbAdmin: { rpc: unknown },
  reservationId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const result = await releaseFixedAiCreditReservation(
    reservationId,
    {
      ...metadata,
      fixedCredits: MARKITDOWN_COST_CREDITS,
      source: 'markitdown_tool',
    },
    sbAdmin
  );

  if (!result.success) {
    console.error('MarkItDown: failed to release AI credit reservation:', {
      reservationId,
      errorCode: result.errorCode,
    });
  }
}

export async function executeConvertFileToMarkdown(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const billingWsId = ctx.creditWsId ?? ctx.wsId;
  const markitdownUrl = resolveDiscordMarkitdownUrl();
  const markitdownSecret = resolveDiscordMarkitdownSecret();

  if (!markitdownUrl) {
    return {
      ok: false,
      error:
        'MarkItDown endpoint is not configured. Missing DISCORD_APP_DEPLOYMENT_URL.',
    };
  }

  if (!markitdownSecret) {
    return {
      ok: false,
      error:
        'MarkItDown endpoint secret is not configured. Set MARKITDOWN_ENDPOINT_SECRET or CRON secret.',
    };
  }

  const storagePathArg =
    typeof args.storagePath === 'string' ? args.storagePath.trim() : '';
  let fileNameArg =
    typeof args.fileName === 'string' ? args.fileName.trim() : '';
  const maxCharactersRaw =
    typeof args.maxCharacters === 'number' &&
    Number.isFinite(args.maxCharacters)
      ? Math.floor(args.maxCharacters)
      : 120_000;
  const maxCharacters = Math.min(Math.max(maxCharactersRaw, 10_000), 120_000);

  const expectedPrefix = `${ctx.wsId}/chats/ai/resources/`;
  let targetPath = storagePathArg;
  let selectedFileName = '';
  let selectedMediaType: string | null = null;

  const sbAdmin = await createAdminClient();

  if (targetPath) {
    if (
      (!targetPath.startsWith(expectedPrefix) || targetPath.includes('..')) &&
      ctx.chatId &&
      !targetPath.includes('/')
    ) {
      fileNameArg ||= targetPath;
      targetPath = '';
    } else if (
      !targetPath.startsWith(expectedPrefix) ||
      targetPath.includes('..')
    ) {
      return { ok: false, error: 'Invalid storagePath for current workspace.' };
    }

    if (targetPath) {
      selectedFileName = targetPath.split('/').pop() ?? targetPath;
      if (isNativeMultimodalFile(selectedFileName)) {
        return {
          ok: false,
          error:
            'Audio, image, and video attachments are already available to the model natively. Do not use convert_file_to_markdown for this file; analyze the attachment directly and answer the user.',
        };
      }
    }
  } else {
    if (!ctx.chatId) {
      return {
        ok: false,
        error:
          'No file specified and chat context is missing. Provide `storagePath`.',
      };
    }

    const chatFolder = `${ctx.wsId}/chats/ai/resources/${ctx.chatId}`;
    const { data: recentMessages, error: recentMessagesError } = await sbAdmin
      .from('ai_chat_messages')
      .select('id, metadata, role, created_at')
      .eq('chat_id', ctx.chatId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (recentMessagesError) {
      return {
        ok: false,
        error: `Failed to inspect recent chat messages: ${recentMessagesError.message}`,
      };
    }

    const latestUserAttachments =
      recentMessages?.find((message) => {
        if (String(message.role ?? '').toLowerCase() !== 'user') return false;
        return (
          normalizeChatAttachmentMetadata(
            (message.metadata as Record<string, unknown> | null)?.attachments
          ).length > 0
        );
      })?.metadata ?? null;
    const preferredAttachments = normalizeChatAttachmentMetadata(
      (latestUserAttachments as Record<string, unknown> | null)?.attachments
    );

    const { data: listedFiles, error: listError } = await sbAdmin.storage
      .from('workspaces')
      .list(chatFolder, {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (listError) {
      return {
        ok: false,
        error: `Failed to list chat files: ${listError.message}`,
      };
    }

    const realFiles = (listedFiles ?? []).filter(
      (entry) => entry.id != null && entry.name !== '.emptyFolderPlaceholder'
    );

    if (realFiles.length === 0) {
      return { ok: false, error: 'No files found in this chat.' };
    }

    const preferredStoragePaths = new Set(
      preferredAttachments.map((attachment) => attachment.storagePath)
    );
    const preferredFileNameSet = new Set(
      preferredAttachments.map((attachment) => attachment.name.toLowerCase())
    );
    const preferredFiles = realFiles.filter((entry) =>
      preferredStoragePaths.has(`${chatFolder}/${entry.name}`)
    );

    const matchByName = (entry: (typeof realFiles)[number]) =>
      entry.name.toLowerCase() === fileNameArg.toLowerCase() ||
      stripTimestampPrefix(entry.name).toLowerCase() ===
        fileNameArg.toLowerCase();

    const pickedFile = fileNameArg
      ? (preferredFiles.find(matchByName) ?? realFiles.find(matchByName))
      : (preferredFiles.find((entry) => {
          const strippedName = stripTimestampPrefix(entry.name).toLowerCase();
          return preferredFileNameSet.has(strippedName);
        }) ??
        preferredFiles[0] ??
        realFiles[0]);

    if (!pickedFile) {
      return {
        ok: false,
        error: `File "${fileNameArg}" was not found in this chat.`,
      };
    }

    selectedFileName = pickedFile.name;
    selectedMediaType =
      typeof pickedFile.metadata?.mimetype === 'string'
        ? pickedFile.metadata.mimetype
        : typeof pickedFile.metadata?.mediaType === 'string'
          ? pickedFile.metadata.mediaType
          : null;

    if (isNativeMultimodalFile(selectedFileName, selectedMediaType)) {
      return {
        ok: false,
        error:
          'Audio, image, and video attachments are already available to the model natively. Do not use convert_file_to_markdown for this file; analyze the attachment directly and answer the user.',
      };
    }

    targetPath = `${chatFolder}/${pickedFile.name}`;
  }

  const reservation = await reserveMarkitdownCredits(
    sbAdmin,
    billingWsId,
    ctx,
    {
      targetPath,
      selectedFileName: stripTimestampPrefix(selectedFileName),
    }
  );

  if (!reservation.ok) {
    return {
      ok: false,
      error: reservation.error,
    };
  }

  const reservationId = reservation.reservationId;
  let shouldReleaseReservation = true;

  try {
    const { data: signedReadData, error: signedReadError } =
      await sbAdmin.storage.from('workspaces').createSignedUrl(targetPath, 120);

    const signedReadUrl = signedReadData?.signedUrl;

    if (signedReadError || !signedReadUrl) {
      return {
        ok: false,
        error: `Failed to create signed download URL: ${signedReadError?.message ?? 'No URL returned'}`,
      };
    }

    const markitdownTimeoutMs = resolveMarkitdownTimeoutMs();
    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      markitdownTimeoutMs
    );

    let conversionResponse: Response;
    try {
      conversionResponse = await fetch(markitdownUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${markitdownSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signed_url: signedReadUrl,
          filename: stripTimestampPrefix(selectedFileName),
          enable_plugins: true,
        }),
        signal: abortController.signal,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? `MarkItDown conversion timed out after ${markitdownTimeoutMs}ms.`
          : 'Failed to reach MarkItDown conversion service.';
      console.error('MarkItDown conversion request failed:', error);
      return { ok: false, error: message };
    } finally {
      clearTimeout(timeoutId);
    }

    if (!conversionResponse.ok) {
      const rawBody = await conversionResponse.text().catch(() => '');
      const safeMessage = rawBody.replace(/\s+/g, ' ').trim().slice(0, 300);
      console.error('MarkItDown conversion failed:', {
        status: conversionResponse.status,
        body: safeMessage,
      });
      return {
        ok: false,
        error: `MarkItDown conversion failed (status ${conversionResponse.status}).`,
      };
    }

    let payload: { ok?: boolean; markdown?: unknown; title?: unknown };
    try {
      payload = (await conversionResponse.json()) as {
        ok?: boolean;
        markdown?: unknown;
        title?: unknown;
      };
    } catch (error) {
      console.error('MarkItDown returned invalid JSON response:', error);
      return { ok: false, error: 'MarkItDown conversion failed.' };
    }
    const markdown =
      typeof payload.markdown === 'string' ? payload.markdown.trim() : '';

    if (!markdown) {
      return { ok: false, error: 'MarkItDown returned empty markdown.' };
    }

    const wasTruncated = markdown.length > maxCharacters;
    const finalMarkdown = wasTruncated
      ? `${markdown.slice(0, maxCharacters)}\n\n[...truncated for token safety...]`
      : markdown;

    const deduction = await commitMarkitdownCredits(sbAdmin, reservationId, {
      wsId: ctx.wsId,
      userId: ctx.userId,
      targetPath,
      selectedFileName: stripTimestampPrefix(selectedFileName),
      markdownLength: markdown.length,
      maxCharacters,
      truncated: wasTruncated,
    });

    if (!deduction.ok) {
      console.error(
        'MarkItDown: conversion succeeded but reserved credit commit failed:',
        {
          wsId: ctx.wsId,
          userId: ctx.userId,
          targetPath,
          reservationId,
          error: deduction.error,
        }
      );

      return {
        ok: false,
        error: deduction.error,
        title: typeof payload.title === 'string' ? payload.title : null,
        fileName: stripTimestampPrefix(selectedFileName),
        storagePath: targetPath,
        truncated: wasTruncated,
        creditDeductionError: deduction.error,
      };
    }

    shouldReleaseReservation = false;

    return {
      ok: true,
      markdown: finalMarkdown,
      title: typeof payload.title === 'string' ? payload.title : null,
      fileName: stripTimestampPrefix(selectedFileName),
      storagePath: targetPath,
      creditsCharged: MARKITDOWN_COST_CREDITS,
      remainingCredits: deduction.remainingCredits,
      truncated: wasTruncated,
    };
  } finally {
    if (shouldReleaseReservation) {
      await releaseMarkitdownCredits(sbAdmin, reservationId, {
        wsId: ctx.wsId,
        userId: ctx.userId,
        targetPath,
        selectedFileName: stripTimestampPrefix(selectedFileName),
        reason: 'markitdown_execution_failed',
      });
    }
  }
}

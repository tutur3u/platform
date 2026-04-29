import { createAdminClient } from '@tuturuuu/supabase/next/server';
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
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
]);

function stripTimestampPrefix(name: string): string {
  const match = name.match(/^\d+_(.+)$/);
  return match?.[1] ?? name;
}

function isUnsafeStoragePath(value: string): boolean {
  return value.includes('..') || value.includes('\\');
}

function isLikelyBareFileName(value: string): boolean {
  return Boolean(value) && !value.includes('/') && !value.includes(':');
}

function getStoragePathFileName(value: string): string {
  return value.split('/').pop() ?? value;
}

function normalizeYoutubeUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:') return null;
    if (!YOUTUBE_HOSTS.has(hostname)) return null;

    if (hostname === 'youtu.be' || hostname === 'www.youtu.be') {
      return parsed.pathname.length > 1 ? parsed.toString() : null;
    }

    const isKnownYoutubePath =
      parsed.pathname === '/watch' ||
      parsed.pathname.startsWith('/shorts/') ||
      parsed.pathname.startsWith('/embed/') ||
      parsed.pathname.startsWith('/live/');

    if (!isKnownYoutubePath) return null;
    if (parsed.pathname === '/watch' && !parsed.searchParams.get('v')) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function parseBaseUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    const isLocalhost =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    const isDockerInternalHost =
      parsed.hostname === 'markitdown' ||
      parsed.hostname === 'host.docker.internal';

    // Require HTTPS, except for local and Docker-internal service calls.
    if (
      parsed.protocol !== 'https:' &&
      !((isLocalhost || isDockerInternalHost) && parsed.protocol === 'http:')
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

function resolveConfiguredMarkitdownUrl(): string | null {
  const endpointUrl = process.env.MARKITDOWN_ENDPOINT_URL?.trim();
  if (!endpointUrl) return null;

  const normalizedEndpointUrl = parseBaseUrl(endpointUrl);
  if (!normalizedEndpointUrl) return null;
  return normalizedEndpointUrl;
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
  const markitdownUrl =
    resolveConfiguredMarkitdownUrl() ?? resolveDiscordMarkitdownUrl();
  const markitdownSecret = resolveDiscordMarkitdownSecret();

  if (!markitdownUrl) {
    return {
      ok: false,
      error:
        'MarkItDown endpoint is not configured. Set MARKITDOWN_ENDPOINT_URL or DISCORD_APP_DEPLOYMENT_URL.',
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
  const sourceUrlArg = typeof args.url === 'string' ? args.url.trim() : '';
  const fileNameArg =
    typeof args.fileName === 'string' ? args.fileName.trim() : '';
  const maxCharactersRaw =
    typeof args.maxCharacters === 'number' &&
    Number.isFinite(args.maxCharacters)
      ? Math.floor(args.maxCharacters)
      : 120_000;
  const maxCharacters = Math.min(Math.max(maxCharactersRaw, 10_000), 120_000);

  const expectedPrefix = `${ctx.wsId}/chats/ai/resources/`;
  const chatFolder = ctx.chatId
    ? `${ctx.wsId}/chats/ai/resources/${ctx.chatId}`
    : '';
  let targetPath = storagePathArg;
  let sourceUrl = sourceUrlArg ? normalizeYoutubeUrl(sourceUrlArg) : null;
  let selectedFileName = '';

  if (sourceUrlArg && !sourceUrl) {
    return {
      ok: false,
      error:
        'Invalid URL for MarkItDown. Direct URL conversion currently supports HTTPS YouTube links only.',
    };
  }

  if (!sourceUrl && targetPath) {
    sourceUrl = normalizeYoutubeUrl(targetPath);
    if (sourceUrl) {
      targetPath = '';
    }
  }

  if (sourceUrl) {
    const markitdownTimeoutMs = resolveMarkitdownTimeoutMs();
    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      markitdownTimeoutMs
    );

    let metadataResponse: Response;
    try {
      metadataResponse = await fetch(markitdownUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${markitdownSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: sourceUrl,
          filename: fileNameArg || 'youtube.md',
          enable_plugins: true,
        }),
        signal: abortController.signal,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? `YouTube metadata lookup timed out after ${markitdownTimeoutMs}ms.`
          : 'Failed to reach YouTube metadata service.';
      console.error('YouTube metadata request failed:', error);
      return { ok: false, error: message };
    } finally {
      clearTimeout(timeoutId);
    }

    if (!metadataResponse.ok) {
      const rawBody = await metadataResponse.text().catch(() => '');
      const safeMessage = rawBody.replace(/\s+/g, ' ').trim().slice(0, 300);
      console.error('YouTube metadata lookup failed:', {
        status: metadataResponse.status,
        body: safeMessage,
      });
      return {
        ok: false,
        error: `YouTube metadata lookup failed (status ${metadataResponse.status}).`,
      };
    }

    let payload: { title?: unknown };
    try {
      payload = (await metadataResponse.json()) as { title?: unknown };
    } catch (error) {
      console.error('YouTube metadata service returned invalid JSON:', error);
      return { ok: false, error: 'YouTube metadata lookup failed.' };
    }

    const title =
      typeof payload.title === 'string' && payload.title.trim()
        ? payload.title.trim()
        : null;

    return {
      ok: true,
      title,
      fileName: fileNameArg || null,
      storagePath: null,
      url: sourceUrl,
      metadataOnly: true,
      supportedCapabilities: ['youtube_title_metadata'],
      unsupportedCapabilities: ['youtube_transcription', 'youtube_summary'],
      message: title
        ? `Only YouTube metadata is supported. Title: ${title}. YouTube transcripts and summaries are not supported.`
        : 'Only YouTube metadata is supported. YouTube transcripts and summaries are not supported.',
    };
  }

  const sbAdmin = await createAdminClient();

  if (!sourceUrl && targetPath) {
    if (isUnsafeStoragePath(targetPath)) {
      return { ok: false, error: 'Invalid storagePath for current workspace.' };
    }

    if (chatFolder && targetPath.startsWith(`${chatFolder}/`)) {
      selectedFileName = getStoragePathFileName(targetPath);
    } else if (targetPath.startsWith(`${ctx.wsId}/user-groups/`)) {
      selectedFileName = getStoragePathFileName(targetPath);
    } else if (isLikelyBareFileName(targetPath)) {
      selectedFileName = targetPath;
      targetPath = '';
    } else if (chatFolder && targetPath.startsWith(expectedPrefix)) {
      // The client can still show pre-move temp attachment paths while the
      // server has already moved the object into the chat folder. Resolve the
      // basename against the current chat instead of failing on stale metadata.
      selectedFileName = fileNameArg || getStoragePathFileName(targetPath);
      targetPath = '';
    } else {
      return { ok: false, error: 'Invalid storagePath for current workspace.' };
    }
  } else if (!sourceUrl) {
    selectedFileName = fileNameArg;
  }

  if (!sourceUrl && !targetPath) {
    if (!ctx.chatId) {
      return {
        ok: false,
        error:
          'No file specified and chat context is missing. Provide `storagePath`.',
      };
    }

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

    const pickedFile = selectedFileName
      ? realFiles.find(
          (entry) =>
            entry.name.toLowerCase() === selectedFileName.toLowerCase() ||
            stripTimestampPrefix(entry.name).toLowerCase() ===
              selectedFileName.toLowerCase()
        )
      : realFiles[0];

    if (!pickedFile) {
      return {
        ok: false,
        error: `File "${selectedFileName}" was not found in this chat.`,
      };
    }

    selectedFileName = pickedFile.name;
    targetPath = `${chatFolder}/${pickedFile.name}`;
  }

  const sourceLabel = sourceUrl
    ? sourceUrl
    : stripTimestampPrefix(selectedFileName);

  const reservation = await reserveMarkitdownCredits(
    sbAdmin,
    billingWsId,
    ctx,
    {
      ...(sourceUrl
        ? { sourceType: 'youtube_url', sourceUrl }
        : {
            sourceType: 'storage_file',
            targetPath,
            selectedFileName: stripTimestampPrefix(selectedFileName),
          }),
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
    let signedReadUrl = '';
    if (!sourceUrl) {
      const { data: signedReadData, error: signedReadError } =
        await sbAdmin.storage
          .from('workspaces')
          .createSignedUrl(targetPath, 120);

      signedReadUrl = signedReadData?.signedUrl ?? '';

      if (signedReadError || !signedReadUrl) {
        return {
          ok: false,
          error: `Failed to create signed download URL: ${signedReadError?.message ?? 'No URL returned'}`,
        };
      }
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
        body: JSON.stringify(
          sourceUrl
            ? {
                url: sourceUrl,
                filename: fileNameArg || 'youtube.md',
                enable_plugins: true,
              }
            : {
                signed_url: signedReadUrl,
                filename: stripTimestampPrefix(selectedFileName),
                enable_plugins: true,
              }
        ),
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
      wsId: billingWsId,
      userId: ctx.userId,
      ...(sourceUrl
        ? { sourceType: 'youtube_url', sourceUrl }
        : {
            sourceType: 'storage_file',
            targetPath,
            selectedFileName: stripTimestampPrefix(selectedFileName),
          }),
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
          source: sourceLabel,
          reservationId,
          error: deduction.error,
        }
      );

      return {
        ok: false,
        error: deduction.error,
        title: typeof payload.title === 'string' ? payload.title : null,
        fileName: sourceUrl
          ? fileNameArg || null
          : stripTimestampPrefix(selectedFileName),
        storagePath: sourceUrl ? null : targetPath,
        url: sourceUrl,
        truncated: wasTruncated,
        creditDeductionError: deduction.error,
      };
    }

    shouldReleaseReservation = false;

    return {
      ok: true,
      markdown: finalMarkdown,
      title: typeof payload.title === 'string' ? payload.title : null,
      fileName: sourceUrl
        ? fileNameArg || null
        : stripTimestampPrefix(selectedFileName),
      storagePath: sourceUrl ? null : targetPath,
      url: sourceUrl,
      creditsCharged: MARKITDOWN_COST_CREDITS,
      remainingCredits: deduction.remainingCredits,
      truncated: wasTruncated,
    };
  } finally {
    if (shouldReleaseReservation) {
      await releaseMarkitdownCredits(sbAdmin, reservationId, {
        wsId: ctx.wsId,
        userId: ctx.userId,
        ...(sourceUrl
          ? { sourceType: 'youtube_url', sourceUrl }
          : {
              sourceType: 'storage_file',
              targetPath,
              selectedFileName: stripTimestampPrefix(selectedFileName),
            }),
        reason: 'markitdown_execution_failed',
      });
    }
  }
}

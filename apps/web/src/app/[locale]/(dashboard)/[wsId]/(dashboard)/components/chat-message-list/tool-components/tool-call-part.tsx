import { Renderer, VisibilityProvider } from '@json-render/react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronRight,
  ClipboardCopy,
  Download,
  Globe,
  Loader2,
  RotateCcw,
  Sparkles,
} from '@tuturuuu/icons';
import { Dialog, DialogContent, DialogTitle } from '@tuturuuu/ui/dialog';
import { cn } from '@tuturuuu/utils/format';
import { getToolName, isToolUIPart } from 'ai';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useState } from 'react';
import { registry } from '@/components/json-render/dashboard-registry';
import { resolveRenderUiSpecFromOutput } from '@/components/json-render/render-ui-spec';
import { humanizeToolName, isObjectRecord } from '../helpers';
import type { RenderUiFailureMeta } from '../resolve-message-render-groups';
import type { ToolPartData } from '../types';
import {
  buildApprovalRequestSpec,
  isApprovalRequestUiData,
} from './approval-request';
import { JsonHighlight } from './json-highlight';
import { parseGoogleSearchSources } from './parse-google-search-sources';
import { parseQrCodeOutput } from './parse-qr-code-output';
import { SourcesPart } from './sources-part';
import { getToolPartStatus } from './tool-status';

type ToolNamePart = Parameters<typeof getToolName>[0];

function isToolNamePart(
  part: ToolPartData
): part is ToolPartData & ToolNamePart {
  return isToolUIPart(part);
}

function getPartOutput(part: ToolPartData): unknown {
  return 'output' in part ? part.output : undefined;
}

function getPartErrorText(part: ToolPartData): string | undefined {
  return typeof part.errorText === 'string' ? part.errorText : undefined;
}

export function ToolCallPart({
  part,
  renderUiFailure,
}: {
  part: ToolPartData;
  renderUiFailure?: RenderUiFailureMeta;
}) {
  const t = useTranslations('dashboard.mira_chat');
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedImageUrl, setCopiedImageUrl] = useState<string | null>(null);
  const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | null>(
    null
  );

  const isToolPart = isToolNamePart(part);
  const rawToolName = isToolPart ? getToolName(part) : '';
  const toolName = isToolPart ? humanizeToolName(rawToolName) : '';
  const output = isToolPart ? getPartOutput(part) : undefined;
  const errorText = isToolPart ? getPartErrorText(part) : undefined;
  const outputRecord = isObjectRecord(output) ? output : null;
  const googleSearchSources = parseGoogleSearchSources(outputRecord);

  const { isDone, isError, isRunning, logicalError } = getToolPartStatus(part);

  const hasOutput = isDone || isError;
  const isImageTool = rawToolName === 'create_image';
  const isQrCodeTool = rawToolName === 'create_qr_code';

  const outputText = isToolPart
    ? isError
      ? errorText ||
        (typeof outputRecord?.error === 'string' ? outputRecord.error : null) ||
        (typeof outputRecord?.message === 'string'
          ? outputRecord.message
          : null) ||
        'Unknown error'
      : JSON.stringify(output, null, 2)
    : '';

  const approvalSpecRaw =
    outputRecord && 'approvalRequest' in outputRecord
      ? outputRecord.approvalRequest
      : undefined;
  const approvalSpec = isApprovalRequestUiData(approvalSpecRaw)
    ? approvalSpecRaw
    : null;
  const approvalUiSpec = approvalSpec
    ? buildApprovalRequestSpec(
        (key: string, values?: Record<string, unknown>) =>
          t(key as never, values as never),
        approvalSpec
      )
    : null;

  const handleCopy = useCallback(() => {
    if (!navigator.clipboard?.writeText) {
      setCopied(false);
      return;
    }

    void navigator.clipboard
      .writeText(outputText)
      .then(() => {
        setCopied(true);
      })
      .catch(() => {
        setCopied(false);
      });
  }, [outputText]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!copiedImageUrl) return;
    const timer = setTimeout(() => setCopiedImageUrl(null), 1500);
    return () => clearTimeout(timer);
  }, [copiedImageUrl]);

  const handleCopyImageToClipboard = useCallback(async (imageUrl: string) => {
    if (!navigator.clipboard?.write || !('ClipboardItem' in window)) {
      return;
    }

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();
      const clipboardItem = new ClipboardItem({
        [blob.type || 'image/png']: blob,
      });
      await navigator.clipboard.write([clipboardItem]);
      setCopiedImageUrl(imageUrl);
    } catch {
      setCopiedImageUrl(null);
    }
  }, []);

  const { setTheme } = useTheme();
  useEffect(() => {
    if (!isToolPart) return;
    if (rawToolName !== 'set_theme' || !isDone || logicalError) return;
    const action = (output as { action?: string } | undefined)?.action;
    const theme = (output as { theme?: string } | undefined)?.theme;
    if (action === 'set_theme' && theme) {
      setTheme(theme);
    }
  }, [isToolPart, rawToolName, isDone, logicalError, output, setTheme]);

  if (!isToolPart) {
    return null;
  }

  if (rawToolName === 'select_tools') {
    const selected = (output as { selectedTools?: string[] } | undefined)
      ?.selectedTools;
    const isNoAction =
      selected?.length === 1 && selected[0] === 'no_action_needed';
    if (isNoAction) {
      return (
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          {isError ? (
            <AlertCircle className="h-3 w-3 text-dynamic-red" />
          ) : isDone ? (
            <Check className="h-3 w-3 text-dynamic-green" />
          ) : (
            <Loader2 className="h-3 w-3 animate-spin" />
          )}
          <span>{t('no_tools_needed')}</span>
        </div>
      );
    }
    const isOnlyGoogleSearch =
      selected?.length === 1 && selected[0] === 'google_search';
    if (isOnlyGoogleSearch) return null;
  }

  if (rawToolName === 'google_search') {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2 rounded-lg border border-dynamic-cyan/30 bg-dynamic-cyan/5 px-3 py-2 text-xs">
          {isRunning ? (
            <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-dynamic-cyan" />
          ) : isError ? (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dynamic-red" />
          ) : (
            <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dynamic-cyan" />
          )}
          <span className="flex items-center gap-1.5">
            <span className="font-medium text-dynamic-cyan">
              {isRunning
                ? t('tool_searching_web')
                : isError
                  ? t('tool_search_failed')
                  : t('tool_searched_web')}
            </span>
          </span>
        </div>
        {isDone && !isError && googleSearchSources.length > 0 && (
          <SourcesPart parts={googleSearchSources} />
        )}
      </div>
    );
  }

  if (isImageTool && isRunning) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-foreground/2 px-3 py-2 text-xs">
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        <span className="flex items-center gap-1.5">
          <span className="font-medium">{toolName}</span>
          <span className="text-muted-foreground">
            {t('tool_generating_image')}
          </span>
        </span>
      </div>
    );
  }

  if (isQrCodeTool && isRunning) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-foreground/2 px-3 py-2 text-xs">
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        <span className="flex items-center gap-1.5">
          <span className="font-medium">{toolName}</span>
          <span className="text-muted-foreground">
            {t('tool_generating_qr')}
          </span>
        </span>
      </div>
    );
  }

  if (rawToolName === 'render_ui' && isRunning) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-dynamic-purple/30 bg-dynamic-purple/5 px-3 py-2 text-xs">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-pulse text-dynamic-purple" />
        <span className="flex items-center gap-1.5">
          <span className="font-medium text-dynamic-purple">{toolName}</span>
          <span className="text-dynamic-purple/70">
            {t('tool_generating_ui')}
          </span>
        </span>
      </div>
    );
  }

  if (rawToolName === 'render_ui' && hasOutput) {
    if (isDone && !logicalError && output) {
      const cleanedSpec = resolveRenderUiSpecFromOutput(output);
      if (cleanedSpec && !renderUiFailure) {
        return (
          <div className="my-2 flex w-full max-w-full flex-col gap-1.5">
            <div className="mb-1 flex items-center gap-1.5 text-xs">
              <Check className="h-3.5 w-3.5 text-dynamic-green" />
              <span className="font-medium">{toolName}</span>
              <span className="text-muted-foreground">{t('tool_done')}</span>
            </div>
            <VisibilityProvider>
              <Renderer spec={cleanedSpec} registry={registry} />
            </VisibilityProvider>
          </div>
        );
      }

      // Compact failure state with attempt count
      const attempts = renderUiFailure?.attemptCount ?? 1;
      return (
        <div className="flex items-start gap-2 rounded-lg border border-dynamic-yellow/30 bg-dynamic-yellow/5 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dynamic-yellow" />
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5">
              <span className="font-medium text-dynamic-yellow">
                {t('tool_render_failed_title')}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-dynamic-yellow/10 px-1.5 py-0.5 font-medium text-[10px] text-dynamic-yellow/80">
                <RotateCcw className="h-2.5 w-2.5" />
                {t('tool_render_attempts', { count: attempts })}
              </span>
            </span>
            <span className="text-muted-foreground">
              {t('tool_render_failed_hint')}
            </span>
          </span>
        </div>
      );
    }
  }

  if (isDone && !logicalError && approvalUiSpec) {
    return (
      <div className="my-2 flex w-full max-w-full flex-col gap-1.5">
        <div className="mb-1 flex items-center gap-1.5 text-xs">
          <Check className="h-3.5 w-3.5 text-dynamic-green" />
          <span className="font-medium">{toolName}</span>
          <span className="text-muted-foreground">{t('tool_done')}</span>
        </div>
        <VisibilityProvider>
          <Renderer spec={approvalUiSpec} registry={registry} />
        </VisibilityProvider>
      </div>
    );
  }

  if (isImageTool && isDone && !logicalError && output) {
    const imageUrl = (output as { imageUrl?: string }).imageUrl;
    if (imageUrl) {
      return (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-xs">
              <Check className="h-3.5 w-3.5 text-dynamic-green" />
              <span className="font-medium">{toolName}</span>
              <span className="text-muted-foreground">{t('tool_done')}</span>
            </div>
            <div className="group/image relative w-fit">
              <button
                type="button"
                onClick={() => setFullscreenImageUrl(imageUrl)}
                className="overflow-hidden rounded-lg border border-border/50 text-left transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-dynamic-blue focus:ring-offset-2"
              >
                {/* biome-ignore lint/performance/noImgElement: Dynamic URL from tool output */}
                <img
                  src={imageUrl}
                  alt={t('generated_image')}
                  className="max-h-80 w-auto cursor-pointer"
                  loading="lazy"
                />
              </button>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleCopyImageToClipboard(imageUrl);
                }}
                className="absolute top-2 right-2 rounded-md border border-white/20 bg-black/60 p-1 text-white opacity-0 backdrop-blur-sm transition hover:bg-black/75 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/60 group-hover/image:opacity-100"
                title={
                  copiedImageUrl === imageUrl
                    ? t('copied_image')
                    : t('copy_image')
                }
              >
                {copiedImageUrl === imageUrl ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <ClipboardCopy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
          <Dialog
            open={fullscreenImageUrl !== null}
            onOpenChange={(open) => !open && setFullscreenImageUrl(null)}
          >
            <DialogContent
              className="max-h-[95vh] max-w-[95vw] border-0 bg-black/95 p-0"
              showCloseButton={false}
            >
              <DialogTitle className="sr-only">
                {t('generated_image')}
              </DialogTitle>
              {fullscreenImageUrl && (
                <button
                  type="button"
                  onClick={() => setFullscreenImageUrl(null)}
                  className="flex size-full min-h-[50vh] items-center justify-center p-4 focus:outline-none focus:ring-0"
                >
                  {/* biome-ignore lint/performance/noImgElement: Dynamic URL from tool output */}
                  <img
                    src={fullscreenImageUrl}
                    alt={t('generated_image')}
                    className="max-h-[90vh] max-w-full object-contain"
                    onClick={(e) => e.stopPropagation()}
                  />
                </button>
              )}
            </DialogContent>
          </Dialog>
        </>
      );
    }
  }

  if (isQrCodeTool && isDone && !logicalError && outputRecord) {
    const qrOutput = parseQrCodeOutput(outputRecord);
    if (qrOutput) {
      return (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-xs">
              <Check className="h-3.5 w-3.5 text-dynamic-green" />
              <span className="font-medium">{toolName}</span>
              <span className="text-muted-foreground">{t('tool_done')}</span>
            </div>

            <div className="group/image relative w-fit">
              <button
                type="button"
                onClick={() => setFullscreenImageUrl(qrOutput.previewUrl)}
                className="w-fit overflow-hidden rounded-lg border border-border/50 text-left transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-dynamic-blue focus:ring-offset-2"
              >
                {/* biome-ignore lint/performance/noImgElement: Dynamic URL from tool output */}
                <img
                  src={qrOutput.previewUrl}
                  alt={t('generated_qr_code')}
                  className="h-auto max-h-64 w-auto cursor-pointer"
                  loading="lazy"
                />
              </button>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleCopyImageToClipboard(qrOutput.previewUrl);
                }}
                className="absolute top-2 right-2 rounded-md border border-white/20 bg-black/60 p-1 text-white opacity-0 backdrop-blur-sm transition hover:bg-black/75 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/60 group-hover/image:opacity-100"
                title={
                  copiedImageUrl === qrOutput.previewUrl
                    ? t('copied_image')
                    : t('copy_image')
                }
              >
                {copiedImageUrl === qrOutput.previewUrl ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <ClipboardCopy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            <a
              href={qrOutput.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={qrOutput.fileName}
              className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border/60 bg-foreground/5 px-2.5 py-1.5 text-xs transition-colors hover:bg-foreground/10"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{t('download_qr_code')}</span>
            </a>
          </div>

          <Dialog
            open={fullscreenImageUrl !== null}
            onOpenChange={(open) => !open && setFullscreenImageUrl(null)}
          >
            <DialogContent
              className="max-h-[95vh] max-w-[95vw] border-0 bg-black/95 p-0"
              showCloseButton={false}
            >
              <DialogTitle className="sr-only">
                {t('generated_qr_code')}
              </DialogTitle>
              {fullscreenImageUrl && (
                <button
                  type="button"
                  onClick={() => setFullscreenImageUrl(null)}
                  className="flex size-full min-h-[50vh] items-center justify-center p-4 focus:outline-none focus:ring-0"
                >
                  {/* biome-ignore lint/performance/noImgElement: Dynamic URL from tool output */}
                  <img
                    src={fullscreenImageUrl}
                    alt={t('generated_qr_code')}
                    className="max-h-[90vh] max-w-full object-contain"
                    onClick={(e) => e.stopPropagation()}
                  />
                </button>
              )}
            </DialogContent>
          </Dialog>
        </>
      );
    }
  }

  return (
    <div
      className={cn(
        'flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
        isError
          ? 'border-dynamic-red/20 bg-dynamic-red/5'
          : 'border-border/50 bg-foreground/2'
      )}
    >
      <span className="mt-0.5 shrink-0">
        {isError ? (
          <AlertCircle className="h-3.5 w-3.5 text-dynamic-red" />
        ) : isDone ? (
          <Check className="h-3.5 w-3.5 text-dynamic-green" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <button
          type="button"
          onClick={() => hasOutput && setExpanded((e) => !e)}
          className={cn(
            'flex items-center gap-1.5',
            hasOutput ? 'cursor-pointer' : 'cursor-default'
          )}
        >
          <span className="font-medium">{toolName}</span>
          <span className="text-muted-foreground">
            {isDone
              ? t('tool_done')
              : isError
                ? t('tool_error')
                : t('tool_running')}
          </span>
          {hasOutput && (
            <ChevronRight
              className={cn(
                'ml-auto h-3 w-3 text-muted-foreground transition-transform',
                expanded && 'rotate-90'
              )}
            />
          )}
        </button>

        {expanded && hasOutput && (
          <div className="relative mt-1">
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-1 right-1 rounded p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              title={t('copy_output')}
            >
              {copied ? (
                <Check className="h-3 w-3 text-dynamic-green" />
              ) : (
                <ClipboardCopy className="h-3 w-3" />
              )}
            </button>
            <pre className="max-h-40 select-text overflow-auto whitespace-pre-wrap rounded bg-foreground/5 p-2 pr-6 font-mono text-[11px]">
              <JsonHighlight text={outputText} isError={isError} />
            </pre>
          </div>
        )}
      </span>
    </div>
  );
}

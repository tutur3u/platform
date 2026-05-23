'use client';

import { RefreshCw, TriangleAlert } from '@tuturuuu/icons';
import type { MindBoardSnapshotResponse } from '@tuturuuu/internal-api/mind';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { EmptyAiState, MindAiMessage } from './mind-ai-message';
import type { MindAiArtifactItem } from './mind-ai-tool-activity';

type Props = {
  applyingPatch?: boolean;
  fullscreen: boolean;
  latestMessage?: UIMessage;
  messages: UIMessage[];
  onApplyPatch?: (patchId: string) => void;
  onOpenArtifact?: (artifact: MindAiArtifactItem) => void;
  onRetryLayoutRefresh?: () => void;
  patchesError?: string | null;
  patches: MindBoardSnapshotResponse['patches'];
  layoutRefreshError?: string | null;
  retryingLayoutRefresh?: boolean;
  status: string;
  visibleError: string | null;
  onPickPrompt: (prompt: string) => void | Promise<void>;
};

export function MindAiPanelContent({
  applyingPatch,
  fullscreen,
  latestMessage,
  messages,
  layoutRefreshError,
  patches,
  patchesError,
  retryingLayoutRefresh,
  status,
  visibleError,
  onApplyPatch,
  onOpenArtifact,
  onPickPrompt,
  onRetryLayoutRefresh,
}: Props) {
  const t = useTranslations('mind');
  const isEmpty =
    messages.length === 0 && !visibleError && patches.length === 0;

  return (
    <div
      className={cn(
        'min-h-full w-full min-w-0',
        fullscreen ? 'mx-auto w-full max-w-6xl space-y-2' : 'space-y-2',
        isEmpty && 'flex items-center justify-center'
      )}
    >
      {messages.length ? (
        messages.map((message) => (
          <MindAiMessage
            applying={applyingPatch}
            isAnimating={
              status === 'streaming' &&
              message.id === latestMessage?.id &&
              message.role === 'assistant'
            }
            key={message.id}
            message={message}
            onApplyPatch={onApplyPatch}
            onOpenArtifact={onOpenArtifact}
            patches={patches}
          />
        ))
      ) : (
        <EmptyAiState onPickPrompt={onPickPrompt} />
      )}
      {patchesError ? (
        <div className="rounded-md border border-dynamic-red/30 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-xs">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">{t('ai.patchLoadErrorTitle')}</p>
              <p className="mt-0.5 break-words text-dynamic-red/90">
                {patchesError}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {layoutRefreshError ? (
        <div className="space-y-2 rounded-md border border-dynamic-yellow/30 bg-dynamic-yellow/10 px-3 py-2 text-xs">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-yellow" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t('ai.layoutRefreshErrorTitle')}</p>
              <p className="mt-0.5 break-words text-muted-foreground">
                {layoutRefreshError}
              </p>
            </div>
          </div>
          {onRetryLayoutRefresh ? (
            <Button
              className="h-7 gap-1.5 px-2 text-xs"
              disabled={retryingLayoutRefresh}
              onClick={onRetryLayoutRefresh}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw
                className={cn(
                  'h-3.5 w-3.5',
                  retryingLayoutRefresh && 'animate-spin'
                )}
              />
              {t('ai.retryLayoutRefresh')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {visibleError ? (
        <div className="rounded-md border border-dynamic-red/30 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-xs">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">{t('ai.errorTitle')}</p>
              <p className="mt-0.5 break-words text-dynamic-red/90">
                {visibleError}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

'use client';

import { RefreshCw, TriangleAlert } from '@tuturuuu/icons';
import type { MindBoardSnapshotResponse } from '@tuturuuu/internal-api/mind';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
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
        <MindAiAlert
          description={patchesError}
          title={t('ai.patchLoadErrorTitle')}
          variant="warning"
        />
      ) : null}
      {layoutRefreshError ? (
        <MindAiAlert
          action={
            onRetryLayoutRefresh ? (
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
            ) : null
          }
          description={layoutRefreshError}
          title={t('ai.layoutRefreshErrorTitle')}
          variant="warning"
        />
      ) : null}
      {visibleError ? (
        <MindAiAlert
          description={visibleError}
          title={t('ai.errorTitle')}
          variant="danger"
        />
      ) : null}
    </div>
  );
}

function MindAiAlert({
  action,
  description,
  title,
  variant,
}: {
  action?: ReactNode;
  description: string;
  title: string;
  variant: 'danger' | 'warning';
}) {
  const isDanger = variant === 'danger';

  return (
    <div
      className={cn(
        'space-y-2 rounded-md border px-3 py-2 text-xs',
        isDanger
          ? 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red'
          : 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-foreground'
      )}
    >
      <div className="flex items-start gap-2">
        <TriangleAlert
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            isDanger ? 'text-dynamic-red' : 'text-dynamic-yellow'
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          <p
            className={cn(
              'mt-0.5 break-words',
              isDanger ? 'text-dynamic-red/90' : 'text-muted-foreground'
            )}
          >
            {description}
          </p>
        </div>
      </div>
      {action ? <div className="pl-6">{action}</div> : null}
    </div>
  );
}

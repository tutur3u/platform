'use client';

import type { UIMessage } from '@tuturuuu/ai/types';
import { LoaderCircle, TriangleAlert } from '@tuturuuu/icons';
import type { MindBoardSnapshotResponse } from '@tuturuuu/internal-api/mind';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  type MindAiDebugContext,
  MindAiDebugDetails,
} from './mind-ai-debug-details';
import { EmptyAiState, MindAiMessage } from './mind-ai-message';
import type { MindAiArtifactItem } from './mind-ai-tool-activity';

type Props = {
  applyingPatch?: boolean;
  debugContext: MindAiDebugContext;
  fullscreen: boolean;
  latestMessage?: UIMessage;
  messages: UIMessage[];
  onApplyPatch?: (patchId: string) => void;
  onOpenArtifact?: (artifact: MindAiArtifactItem) => void;
  patches: MindBoardSnapshotResponse['patches'];
  status: string;
  statusLabel: string | null;
  visibleError: string | null;
  onPickPrompt: (prompt: string) => void | Promise<void>;
};

export function MindAiPanelContent({
  applyingPatch,
  debugContext,
  fullscreen,
  latestMessage,
  messages,
  patches,
  status,
  statusLabel,
  visibleError,
  onApplyPatch,
  onOpenArtifact,
  onPickPrompt,
}: Props) {
  const t = useTranslations('mind');
  const isEmpty =
    messages.length === 0 &&
    !statusLabel &&
    !visibleError &&
    patches.length === 0;

  return (
    <div
      className={cn(
        'min-h-full',
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
      {statusLabel ? (
        <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-muted-foreground text-xs">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          {statusLabel}
        </div>
      ) : null}
      {visibleError ? (
        <div className="space-y-2 rounded-md border border-dynamic-red/30 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-xs">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">{t('ai.errorTitle')}</p>
              <p className="mt-0.5 break-words text-dynamic-red/90">
                {visibleError}
              </p>
            </div>
          </div>
          <MindAiDebugDetails context={debugContext} tone="error" />
        </div>
      ) : null}
      {statusLabel ? <MindAiDebugDetails context={debugContext} /> : null}
    </div>
  );
}

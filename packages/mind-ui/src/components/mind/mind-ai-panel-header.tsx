'use client';

import { Bot, Info, LoaderCircle, SlidersHorizontal } from '@tuturuuu/icons';
import type { AIModelUI } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { MindAiControls } from './mind-ai-controls';
import {
  type MindAiDebugContext,
  MindAiDebugDetails,
} from './mind-ai-debug-details';
import { MindAiHeaderActions } from './mind-ai-header-actions';
import type { MindAiThinkingMode } from './mind-ai-options';
import type { MindAiCreditSource } from './use-mind-ai-preferences';

type Props = {
  creditSource: MindAiCreditSource;
  chatJson: string;
  chatMarkdown: string;
  debugContext: MindAiDebugContext;
  directWrite: boolean;
  fullscreen: boolean;
  model: AIModelUI;
  statusLabel: string | null;
  thinkingMode: MindAiThinkingMode;
  personalWsId?: string;
  workspaceCreditLocked?: boolean;
  onClose: () => void;
  onCreditSourceChange: (value: MindAiCreditSource) => void;
  onDirectWriteChange: (value: boolean) => void;
  onModelChange: (value: AIModelUI) => void;
  onNewChat: () => void;
  onThinkingModeChange: (value: MindAiThinkingMode) => void;
  onToggleFullscreen: () => void;
  wsId: string;
};

export function MindAiPanelHeader({
  creditSource,
  chatJson,
  chatMarkdown,
  debugContext,
  directWrite,
  fullscreen,
  model,
  statusLabel,
  thinkingMode,
  personalWsId,
  workspaceCreditLocked,
  onClose,
  onCreditSourceChange,
  onDirectWriteChange,
  onModelChange,
  onNewChat,
  onThinkingModeChange,
  onToggleFullscreen,
  wsId,
}: Props) {
  const t = useTranslations('mind');
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div
      className={cn(
        'border-border border-b',
        fullscreen
          ? 'grid min-w-0 items-center gap-2 px-3 py-1.5'
          : 'space-y-1.5 px-3 py-2'
      )}
      style={
        fullscreen
          ? { gridTemplateColumns: 'auto minmax(0, 1fr) auto' }
          : undefined
      }
    >
      <div
        className={cn(
          'flex items-start justify-between gap-3',
          fullscreen && 'w-auto shrink-0 items-center'
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-dynamic-blue" />
            <h2
              className={cn(
                'font-semibold tracking-normal',
                fullscreen && 'max-w-28 truncate text-sm'
              )}
            >
              {t('ai.title')}
            </h2>
            {statusLabel ? (
              <span
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50 text-dynamic-blue"
                title={statusLabel}
              >
                <LoaderCircle className="h-3 w-3 animate-spin" />
                <span className="sr-only">{statusLabel}</span>
              </span>
            ) : null}
          </div>
        </div>
        {!fullscreen ? (
          <div className="flex shrink-0 items-center gap-1">
            <MindAiDebugMenu debugContext={debugContext} />
            <Button
              aria-label={t('ai.assistantSettings')}
              className="h-7 w-7"
              onClick={() => setSettingsOpen((value) => !value)}
              size="icon"
              type="button"
              variant={settingsOpen ? 'secondary' : 'ghost'}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
            <MindAiHeaderActions
              fullscreen={fullscreen}
              chatJson={chatJson}
              chatMarkdown={chatMarkdown}
              onClose={onClose}
              onNewChat={onNewChat}
              onToggleFullscreen={onToggleFullscreen}
            />
          </div>
        ) : null}
      </div>
      {fullscreen || settingsOpen ? (
        <MindAiControls
          compact={fullscreen}
          creditSource={creditSource}
          directWrite={directWrite}
          model={model}
          onCreditSourceChange={onCreditSourceChange}
          onDirectWriteChange={onDirectWriteChange}
          onModelChange={onModelChange}
          onThinkingModeChange={onThinkingModeChange}
          personalWsId={personalWsId}
          thinkingMode={thinkingMode}
          workspaceCreditLocked={workspaceCreditLocked}
          wsId={wsId}
        />
      ) : null}
      {fullscreen ? (
        <div className="flex shrink-0 items-center gap-1">
          <MindAiDebugMenu debugContext={debugContext} />
          <MindAiHeaderActions
            fullscreen={fullscreen}
            chatJson={chatJson}
            chatMarkdown={chatMarkdown}
            onClose={onClose}
            onNewChat={onNewChat}
            onToggleFullscreen={onToggleFullscreen}
          />
        </div>
      ) : null}
    </div>
  );
}

function MindAiDebugMenu({
  debugContext,
}: {
  debugContext: MindAiDebugContext;
}) {
  const t = useTranslations('mind');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t('ai.debugDetails')}
          className="h-7 w-7"
          size="icon"
          type="button"
          variant="ghost"
        >
          <Info className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-2">
        <MindAiDebugDetails context={debugContext} defaultOpen />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

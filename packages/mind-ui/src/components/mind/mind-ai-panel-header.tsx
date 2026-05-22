'use client';

import { Bot, SlidersHorizontal } from '@tuturuuu/icons';
import type { AIModelUI } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { MindAiControls } from './mind-ai-controls';
import { MindAiHeaderActions } from './mind-ai-header-actions';
import type { MindAiThinkingMode } from './mind-ai-options';
import type { MindAiCreditSource } from './use-mind-ai-preferences';

type Props = {
  creditSource: MindAiCreditSource;
  chatJson: string;
  chatMarkdown: string;
  directWrite: boolean;
  fullscreen: boolean;
  model: AIModelUI;
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
  directWrite,
  fullscreen,
  model,
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
          ? 'flex min-w-0 items-center gap-2 px-3 py-1.5'
          : 'space-y-1.5 px-3 py-2'
      )}
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
          </div>
        </div>
        {!fullscreen ? (
          <div className="flex shrink-0 items-center gap-1">
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

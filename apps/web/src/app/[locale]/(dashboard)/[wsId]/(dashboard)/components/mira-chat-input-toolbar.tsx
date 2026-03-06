'use client';

import { Brain, Coins, User, Users, Zap } from '@tuturuuu/icons';
import type { AIModelUI } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { CreditSource, ThinkingMode } from './mira-chat-constants';
import MiraCreditBar from './mira-credit-bar';
import { CreditSourceInlineBar } from './mira-credit-source-inline-bar';
import MiraModelSelector from './mira-model-selector';

interface MiraChatInputToolbarProps {
  activeCreditSource: CreditSource;
  creditWsId?: string;
  hotkeyLabels: {
    creditSource: string;
    fastMode: string;
    modelPicker: string;
    thinkingMode: string;
  };
  isPersonalWorkspace: boolean;
  model: AIModelUI;
  modelPickerHotkeySignal: number;
  onCreditSourceChange: (source: CreditSource) => void;
  onModelChange: (model: AIModelUI) => void;
  onThinkingModeChange: (mode: ThinkingMode) => void;
  personalWsId?: string;
  thinkingMode: ThinkingMode;
  workspaceCreditLocked: boolean;
  wsId: string;
}

export default function MiraChatInputToolbar({
  activeCreditSource,
  creditWsId,
  hotkeyLabels,
  isPersonalWorkspace,
  model,
  modelPickerHotkeySignal,
  onCreditSourceChange,
  onModelChange,
  onThinkingModeChange,
  personalWsId,
  thinkingMode,
  workspaceCreditLocked,
  wsId,
}: MiraChatInputToolbarProps) {
  const t = useTranslations('dashboard.mira_chat');
  const [isCreditSourceMenuOpen, setIsCreditSourceMenuOpen] = useState(false);
  const [isThinkingMenuOpen, setIsThinkingMenuOpen] = useState(false);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {/* Model picker */}
      <MiraModelSelector
        creditsWsId={creditWsId}
        wsId={wsId}
        model={model}
        onChange={onModelChange}
        disabled={false}
        hotkeySignal={modelPickerHotkeySignal}
        shortcutLabel={hotkeyLabels.modelPicker}
      />

      <div className="h-4 w-px bg-border/50" />

      {/* Thinking mode */}
      <Tooltip open={isThinkingMenuOpen ? false : undefined}>
        <DropdownMenu
          open={isThinkingMenuOpen}
          onOpenChange={setIsThinkingMenuOpen}
        >
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-muted-foreground text-xs hover:text-foreground"
                aria-label={t('thinking_mode_label')}
              >
                {thinkingMode === 'thinking' ? (
                  <Brain className="h-3.5 w-3.5" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                {thinkingMode === 'thinking'
                  ? t('thinking_mode_thinking')
                  : t('thinking_mode_fast')}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            {thinkingMode === 'thinking'
              ? `${t('thinking_mode_thinking')} — ${t('thinking_mode_thinking_desc')}`
              : `${t('thinking_mode_fast')} — ${t('thinking_mode_fast_desc')}`}
          </TooltipContent>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem
              onSelect={() => {
                onThinkingModeChange('fast');
                setIsThinkingMenuOpen(false);
              }}
              title={t('thinking_mode_fast_desc')}
              className="gap-2"
            >
              <Zap className="h-3.5 w-3.5" />
              {t('thinking_mode_fast')}
              <span className="ml-auto text-muted-foreground text-xs">
                {hotkeyLabels.fastMode}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onThinkingModeChange('thinking');
                setIsThinkingMenuOpen(false);
              }}
              title={t('thinking_mode_thinking_desc')}
              className="gap-2"
            >
              <Brain className="h-3.5 w-3.5" />
              {t('thinking_mode_thinking')}
              <span className="ml-auto text-muted-foreground text-xs">
                {hotkeyLabels.thinkingMode}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Tooltip>

      {/* Credit source */}
      {isPersonalWorkspace ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-muted-foreground text-xs"
              aria-label={t('credit_source_label')}
              disabled
            >
              <Coins className="h-3.5 w-3.5" />
              {t('credit_source_personal')}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('credit_source_personal_desc')}</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip open={isCreditSourceMenuOpen ? false : undefined}>
          <DropdownMenu
            open={isCreditSourceMenuOpen}
            onOpenChange={setIsCreditSourceMenuOpen}
          >
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-muted-foreground text-xs hover:text-foreground"
                  aria-label={t('credit_source_label')}
                >
                  <Coins className="h-3.5 w-3.5" />
                  {activeCreditSource === 'personal'
                    ? t('credit_source_personal')
                    : t('credit_source_workspace')}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              {`${t('credit_source_label')} (${hotkeyLabels.creditSource})`}
            </TooltipContent>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuItem
                className="items-start"
                disabled={workspaceCreditLocked}
                onSelect={() => {
                  onCreditSourceChange('workspace');
                  setIsCreditSourceMenuOpen(false);
                }}
                title={
                  workspaceCreditLocked
                    ? t('credit_source_workspace_locked_free')
                    : t('credit_source_workspace_desc')
                }
              >
                <div className="flex w-full flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      {t('credit_source_workspace')}
                    </span>
                    {!workspaceCreditLocked && (
                      <span className="text-muted-foreground text-xs">
                        {hotkeyLabels.creditSource}
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {workspaceCreditLocked
                      ? t('credit_source_workspace_locked_free')
                      : t('credit_source_workspace_desc')}
                  </span>
                  {!workspaceCreditLocked && (
                    <CreditSourceInlineBar wsId={wsId} t={t} />
                  )}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="items-start"
                onSelect={() => {
                  onCreditSourceChange('personal');
                  setIsCreditSourceMenuOpen(false);
                }}
                title={t('credit_source_personal_desc')}
              >
                <div className="flex w-full flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      {t('credit_source_personal')}
                    </span>
                    {!workspaceCreditLocked && (
                      <span className="text-muted-foreground text-xs">
                        {hotkeyLabels.creditSource}
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {t('credit_source_personal_desc')}
                  </span>
                  <CreditSourceInlineBar wsId={personalWsId} t={t} />
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Tooltip>
      )}

      {/* Credit meter — pushed to the right */}
      <div className={cn('ml-auto')}>
        <MiraCreditBar wsId={creditWsId} />
      </div>
    </div>
  );
}

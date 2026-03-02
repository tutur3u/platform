'use client';

import {
  Brain,
  Download,
  Ellipsis,
  Eye,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  PanelBottomOpen,
  Zap,
} from '@tuturuuu/icons';
import type { AIModelUI } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { CreditSource, ThinkingMode } from './mira-chat-constants';
import MiraCreditBar from './mira-credit-bar';
import { CreditSourceInlineBar } from './mira-credit-source-inline-bar';
import MiraModelSelector from './mira-model-selector';

interface MiraChatHeaderProps {
  activeCreditSource: CreditSource;
  creditWsId?: string;
  wsId: string;
  hasMessages: boolean;
  hotkeyLabels: {
    creditSource: string;
    export: string;
    fastMode: string;
    fullscreen: string;
    modelPicker: string;
    newChat: string;
    thinkingMode: string;
    viewOnly: string;
  };
  insightsDock?: ReactNode;
  isFullscreen?: boolean;
  isPersonalWorkspace: boolean;
  model: AIModelUI;
  modelPickerHotkeySignal: number;
  onCreditSourceChange: (source: CreditSource) => void;
  onExportChat: () => void;
  onModelChange: (model: AIModelUI) => void;
  onNewConversation: () => void;
  onThinkingModeChange: (mode: ThinkingMode) => void;
  onToggleFullscreen?: () => void;
  onToggleViewOnly: () => void;
  personalWsId?: string;
  t: (...args: any[]) => string;
  thinkingMode: ThinkingMode;
  viewOnly: boolean;
  workspaceCreditLocked: boolean;
  workspaceContextBadge?: ReactNode;
}

export function MiraChatHeader({
  activeCreditSource,
  creditWsId,
  wsId,
  hasMessages,
  hotkeyLabels,
  insightsDock,
  isFullscreen,
  isPersonalWorkspace,
  model,
  modelPickerHotkeySignal,
  onCreditSourceChange,
  onExportChat,
  onModelChange,
  onNewConversation,
  onThinkingModeChange,
  onToggleFullscreen,
  onToggleViewOnly,
  personalWsId,
  t,
  thinkingMode,
  viewOnly,
  workspaceCreditLocked,
  workspaceContextBadge,
}: MiraChatHeaderProps) {
  const [isCreditSourceMenuOpen, setIsCreditSourceMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isThinkingMenuOpen, setIsThinkingMenuOpen] = useState(false);

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 pb-2">
      <div className="w-full min-w-0 max-w-md">
        <MiraModelSelector
          wsId={wsId}
          model={model}
          onChange={onModelChange}
          disabled={false}
          hotkeySignal={modelPickerHotkeySignal}
          shortcutLabel={hotkeyLabels.modelPicker}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {workspaceContextBadge}

        {/* Credit source: static tooltip in personal workspace, dropdown otherwise */}
        {isPersonalWorkspace ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-2 text-xs"
                aria-label={t('credit_source_label')}
              >
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
                    variant="outline"
                    className="h-8 gap-1.5 px-2 text-xs"
                    aria-label={t('credit_source_label')}
                  >
                    {activeCreditSource === 'personal'
                      ? t('credit_source_personal')
                      : t('credit_source_workspace')}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                {`${t('credit_source_label')} (${hotkeyLabels.creditSource})`}
              </TooltipContent>
              <DropdownMenuContent align="end" className="w-72">
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
                      <span>{t('credit_source_workspace')}</span>
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
                      <span>{t('credit_source_personal')}</span>
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

        {/* Thinking mode dropdown with tooltip */}
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
                  variant="outline"
                  className="h-8 gap-1.5 px-2 text-xs"
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
            <DropdownMenuContent align="end" className="w-44">
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

        {/* Credit meter */}
        <div className="ml-2">
          <MiraCreditBar wsId={creditWsId} />
        </div>

        {/* New conversation button with tooltip */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onNewConversation}
              aria-label={t('new_conversation')}
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {`${t('new_conversation')} (${hotkeyLabels.newChat})`}
          </TooltipContent>
        </Tooltip>

        {/* More actions dropdown with tooltip */}
        <Tooltip open={isMoreMenuOpen ? false : undefined}>
          <DropdownMenu open={isMoreMenuOpen} onOpenChange={setIsMoreMenuOpen}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2"
                  aria-label={t('more_actions')}
                >
                  <Ellipsis className="h-4 w-4" />
                  <span className="text-xs">{t('more_actions')}</span>
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t('more_actions')}</TooltipContent>
            <DropdownMenuContent align="end" className="w-56">
              {hasMessages && (
                <DropdownMenuItem
                  onSelect={() => {
                    onExportChat();
                    setIsMoreMenuOpen(false);
                  }}
                >
                  <Download className="h-4 w-4" />
                  {t('export_chat')}
                  <span className="ml-auto text-muted-foreground text-xs">
                    {hotkeyLabels.export}
                  </span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={!hasMessages}
                onSelect={() => {
                  onToggleViewOnly();
                  setIsMoreMenuOpen(false);
                }}
              >
                {viewOnly ? (
                  <PanelBottomOpen className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                {viewOnly ? t('show_input_panel') : t('view_only')}
                <span className="ml-auto text-muted-foreground text-xs">
                  {hotkeyLabels.viewOnly}
                </span>
              </DropdownMenuItem>
              {onToggleFullscreen && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      onToggleFullscreen();
                      setIsMoreMenuOpen(false);
                    }}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                    {isFullscreen ? t('exit_fullscreen') : t('fullscreen')}
                    <span className="ml-auto text-muted-foreground text-xs">
                      {hotkeyLabels.fullscreen}
                    </span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </Tooltip>

        {insightsDock && <div className="shrink-0">{insightsDock}</div>}
      </div>
    </div>
  );
}

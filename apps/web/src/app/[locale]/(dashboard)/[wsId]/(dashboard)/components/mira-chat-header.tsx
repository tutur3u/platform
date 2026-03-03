'use client';

import {
  Download,
  Ellipsis,
  Eye,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  PanelBottomOpen,
} from '@tuturuuu/icons';
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

interface MiraChatHeaderProps {
  hasMessages: boolean;
  hotkeyLabels: {
    export: string;
    fullscreen: string;
    newChat: string;
    viewOnly: string;
  };
  insightsDock?: ReactNode;
  isFullscreen?: boolean;
  onExportChat: () => void;
  onNewConversation: () => void;
  onToggleFullscreen?: () => void;
  onToggleViewOnly: () => void;
  t: (...args: any[]) => string;
  viewOnly: boolean;
  workspaceContextBadge?: ReactNode;
}

export function MiraChatHeader({
  hasMessages,
  hotkeyLabels,
  insightsDock,
  isFullscreen,
  onExportChat,
  onNewConversation,
  onToggleFullscreen,
  onToggleViewOnly,
  t,
  viewOnly,
  workspaceContextBadge,
}: MiraChatHeaderProps) {
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  return (
    <div className="flex min-w-0 items-center justify-between gap-2 pb-2">
      {/* Left: workspace context badge */}
      <div className="flex min-w-0 items-center gap-1.5">
        {workspaceContextBadge}
      </div>

      {/* Right: actions */}
      <div className="flex shrink-0 items-center gap-1">
        {/* New conversation */}
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

        {/* More actions */}
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

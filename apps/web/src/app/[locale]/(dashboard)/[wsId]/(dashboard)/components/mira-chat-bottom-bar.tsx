'use client';

import { AudioLines, MessageSquare } from '@tuturuuu/icons';
import type { AIModelUI } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import ChatInputBar from './chat-input-bar';
import type { ChatFile } from './file-preview-chips';
import type { CreditSource, ThinkingMode } from './mira-chat-constants';
import MiraChatInputToolbar from './mira-chat-input-toolbar';
import { useMiraComposerDensity } from './use-mira-composer-density';

interface MiraChatBottomBarProps {
  liveControls?: ReactNode;
  liveInputOpen?: boolean;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  composerRef?: RefObject<HTMLDivElement | null>;
  assistantName: string;
  attachedFiles: ChatFile[];
  bottomBarVisible: boolean;
  floating: boolean;
  canUploadFiles: boolean;
  input: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isBusy: boolean;
  disabled?: boolean;
  onFileRemove: (id: string) => void;
  onFilesSelected?: (files: File[]) => void;
  onSubmit: (value: string) => void;
  onVoiceToggle?: () => void;
  voiceActive?: boolean;
  setInput: (value: string) => void;
  // Toolbar props
  activeCreditSource: CreditSource;
  creditWsId?: string;
  isPersonalWorkspace: boolean;
  model: AIModelUI;
  modelPickerHotkeySignal: number;
  onCreditSourceChange: (source: CreditSource) => void;
  onModelChange: (model: AIModelUI) => void;
  onThinkingModeChange: (mode: ThinkingMode) => void;
  personalWsId?: string;
  thinkingMode: ThinkingMode;
  toolbarContentRef: RefObject<HTMLDivElement | null>;
  workspaceCreditLocked: boolean;
  wsId: string;
  hotkeyLabels: {
    creditSource: string;
    fastMode: string;
    modelPicker: string;
    thinkingMode: string;
  };
}

export function MiraChatBottomBar({
  liveControls,
  liveInputOpen,
  composerRef,
  scrollContainerRef,
  assistantName,
  attachedFiles,
  bottomBarVisible,
  floating,
  canUploadFiles,
  input,
  inputRef,
  isBusy,
  disabled,
  onFileRemove,
  onFilesSelected,
  onSubmit,
  onVoiceToggle,
  voiceActive,
  setInput,
  // Toolbar props
  activeCreditSource,
  creditWsId,
  isPersonalWorkspace,
  model,
  modelPickerHotkeySignal,
  onCreditSourceChange,
  onModelChange,
  onThinkingModeChange,
  personalWsId,
  thinkingMode,
  toolbarContentRef,
  workspaceCreditLocked,
  wsId,
  hotkeyLabels,
}: MiraChatBottomBarProps) {
  const t = useTranslations('dashboard.mira_chat');
  const voiceT = useTranslations('dashboard.voice_assistant');
  const compactButtonRef = useRef<HTMLButtonElement>(null);
  const restoreCompactFocus = useRef(false);
  const onCollapse = useCallback(() => {
    restoreCompactFocus.current = !!inputRef.current
      ?.closest('[data-mira-composer]')
      ?.contains(document.activeElement);
  }, [inputRef]);
  const density = useMiraComposerDensity({
    onCollapse,
    enabled: floating && !voiceActive,
    protectedContent: !!input || attachedFiles.length > 0,
    scrollContainerRef,
  });
  useEffect(() => {
    if (density.compact && restoreCompactFocus.current) {
      compactButtonRef.current?.focus({ preventScroll: true });
      restoreCompactFocus.current = false;
    }
  }, [density.compact]);
  const { expand } = density;
  const toolbarShown =
    (bottomBarVisible || !!input || attachedFiles.length > 0) && !voiceActive;
  useEffect(() => {
    if (modelPickerHotkeySignal > 0) expand();
  }, [expand, modelPickerHotkeySignal]);
  return (
    <div
      ref={composerRef}
      data-mira-composer=""
      onPointerMove={density.onActivity}
      onKeyDownCapture={density.onActivity}
      onFocusCapture={(event) => {
        if (!density.compact) {
          const inMenu = event.target.closest(
            '[role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]'
          );
          density.onFocus(
            !inputRef.current?.isSameNode(event.target) || !!inMenu
          );
        }
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          density.onBlur();
      }}
      className={cn(
        'pointer-events-none z-10 flex min-w-0 max-w-full flex-col items-end p-3 sm:p-4',
        floating && !voiceActive
          ? 'absolute right-0 bottom-0 left-0'
          : 'relative shrink-0',
        voiceActive && 'gap-2 border-border/50 border-t bg-background/95 pt-3'
      )}
    >
      {voiceActive && (
        <div className="pointer-events-auto max-h-[40dvh] w-full min-w-0 overflow-y-auto overscroll-contain rounded-2xl border border-border/60 bg-muted/20 p-2 shadow-xs">
          {liveControls}
        </div>
      )}
      {!voiceActive && density.compact && (
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border bg-background/85 p-1 shadow-lg backdrop-blur-xl">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                ref={compactButtonRef}
                size="sm"
                variant="ghost"
                className="gap-2 rounded-full"
                onClick={() => {
                  expand();
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
              >
                <MessageSquare className="size-4" />
                {voiceT('chat_mode')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t('placeholder', { name: assistantName })}
            </TooltipContent>
          </Tooltip>
          {onVoiceToggle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 rounded-full"
                  aria-label={voiceT('live_mode')}
                  onClick={onVoiceToggle}
                >
                  <AudioLines className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{voiceT('live_mode')}</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
      <div
        hidden={voiceActive ? !liveInputOpen : density.compact}
        className="pointer-events-auto w-full min-w-0 rounded-2xl bg-background/85 shadow-sm backdrop-blur-xl"
      >
        <div
          inert={!toolbarShown}
          className={cn(
            'overflow-hidden transition-[max-height,margin-bottom,opacity] duration-200 ease-out',
            toolbarShown
              ? 'mb-2 max-h-16 opacity-100'
              : 'pointer-events-none mb-0 max-h-0 opacity-0'
          )}
        >
          <div ref={toolbarContentRef} className="min-w-0 px-1 pt-1">
            <MiraChatInputToolbar
              activeCreditSource={activeCreditSource}
              creditWsId={creditWsId}
              hotkeyLabels={hotkeyLabels}
              isPersonalWorkspace={isPersonalWorkspace}
              model={model}
              modelPickerHotkeySignal={modelPickerHotkeySignal}
              onCreditSourceChange={onCreditSourceChange}
              onModelChange={onModelChange}
              onThinkingModeChange={onThinkingModeChange}
              personalWsId={personalWsId}
              thinkingMode={thinkingMode}
              workspaceCreditLocked={workspaceCreditLocked}
              wsId={wsId}
            />
          </div>
        </div>
        <div className="relative min-w-0">
          <ChatInputBar
            input={input}
            setInput={setInput}
            onSubmit={onSubmit}
            isStreaming={isBusy}
            disabled={disabled}
            assistantName={assistantName}
            onVoiceToggle={voiceActive ? undefined : onVoiceToggle}
            voiceActive={voiceActive}
            inputRef={inputRef}
            files={attachedFiles}
            onFilesSelected={onFilesSelected}
            onFileRemove={onFileRemove}
            canUploadFiles={canUploadFiles}
          />
        </div>
      </div>
    </div>
  );
}

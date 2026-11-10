'use client';

import { AudioLines } from '@tuturuuu/icons';
import type { AIModelUI } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { ReactNode, RefObject } from 'react';
import ChatInputBar from './chat-input-bar';
import type { ChatFile } from './file-preview-chips';
import type { CreditSource, ThinkingMode } from './mira-chat-constants';
import MiraChatInputToolbar from './mira-chat-input-toolbar';

interface MiraChatBottomBarProps {
  liveControls?: ReactNode;
  liveInputOpen?: boolean;
  composerRef?: RefObject<HTMLDivElement | null>;
  assistantName: string;
  attachedFiles: ChatFile[];
  bottomBarVisible: boolean;
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
  assistantName,
  attachedFiles,
  bottomBarVisible,
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
  const voiceT = useTranslations('dashboard.voice_assistant');
  const reducedMotion = useReducedMotion();
  const toolbarShown = bottomBarVisible || !!input || attachedFiles.length > 0;
  const inputVisible = !voiceActive || !!liveInputOpen;
  return (
    <div
      ref={composerRef}
      data-mira-composer=""
      className="relative z-10 flex min-w-0 max-w-full shrink-0 flex-col gap-2 p-3 sm:p-4"
    >
      <div
        data-mira-toolset=""
        hidden={!voiceActive && !toolbarShown}
        className="min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-2 shadow-xs"
      >
        <motion.div
          key={voiceActive ? 'live' : 'chat'}
          initial={reducedMotion ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        >
          {voiceActive ? (
            liveControls
          ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div ref={toolbarContentRef} className="min-w-0 flex-1">
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
              {onVoiceToggle && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-9 shrink-0 rounded-xl"
                      aria-label={voiceT('live_mode')}
                      onClick={onVoiceToggle}
                    >
                      <AudioLines aria-hidden className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{voiceT('live_mode')}</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </motion.div>
      </div>
      <div
        aria-hidden={!inputVisible}
        inert={!inputVisible}
        className={cn(
          'grid min-w-0 transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
          inputVisible
            ? 'grid-rows-[1fr] opacity-100 motion-safe:delay-75'
            : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="relative min-w-0 rounded-2xl">
            <ChatInputBar
              input={input}
              setInput={setInput}
              onSubmit={onSubmit}
              isStreaming={isBusy}
              disabled={disabled}
              assistantName={assistantName}
              onVoiceToggle={undefined}
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
    </div>
  );
}

'use client';

import type { AIModelUI } from '@tuturuuu/types';
import { cn } from '@tuturuuu/utils/format';
import type { RefObject } from 'react';
import ChatInputBar from './chat-input-bar';
import type { ChatFile } from './file-preview-chips';
import type { CreditSource, ThinkingMode } from './mira-chat-constants';
import MiraChatInputToolbar from './mira-chat-input-toolbar';

interface MiraChatBottomBarProps {
  assistantName: string;
  attachedFiles: ChatFile[];
  bottomBarVisible: boolean;
  canUploadFiles: boolean;
  input: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isBusy: boolean;
  onFileRemove: (id: string) => void;
  onFilesSelected?: (files: File[]) => void;
  onSubmit: (value: string) => void;
  onVoiceToggle?: () => void;
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
  assistantName,
  attachedFiles,
  bottomBarVisible,
  canUploadFiles,
  input,
  inputRef,
  isBusy,
  onFileRemove,
  onFilesSelected,
  onSubmit,
  onVoiceToggle,
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
  return (
    <div
      className={cn(
        'absolute right-0 bottom-0 left-0 z-10 flex min-w-0 max-w-full flex-col p-3 sm:p-4'
      )}
    >
      <div
        className={cn(
          'overflow-hidden transition-[max-height,margin-bottom,opacity] duration-200 ease-out',
          bottomBarVisible
            ? 'mb-2 max-h-16 opacity-100'
            : 'pointer-events-none mb-0 max-h-0 opacity-0'
        )}
      >
        <div ref={toolbarContentRef} className="min-w-0">
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
      <div className="min-w-0">
        <ChatInputBar
          input={input}
          setInput={setInput}
          onSubmit={onSubmit}
          isStreaming={isBusy}
          assistantName={assistantName}
          onVoiceToggle={onVoiceToggle}
          inputRef={inputRef}
          files={attachedFiles}
          onFilesSelected={onFilesSelected}
          onFileRemove={onFileRemove}
          canUploadFiles={canUploadFiles}
        />
      </div>
    </div>
  );
}

'use client';

import { cn } from '@tuturuuu/utils/format';
import type { RefObject } from 'react';
import ChatInputBar from './chat-input-bar';
import type { ChatFile } from './file-preview-chips';
import QuickActionChips from './quick-action-chips';

interface MiraChatBottomBarProps {
  assistantName: string;
  attachedFiles: ChatFile[];
  bottomBarVisible: boolean;
  canUploadFiles: boolean;
  hasMessages: boolean;
  input: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isBusy: boolean;
  onFileRemove: (id: string) => void;
  onFilesSelected?: (files: File[]) => void;
  onSubmit: (value: string) => void;
  onVoiceToggle?: () => void;
  setInput: (value: string) => void;
}

export function MiraChatBottomBar({
  assistantName,
  attachedFiles,
  bottomBarVisible,
  canUploadFiles,
  hasMessages,
  input,
  inputRef,
  isBusy,
  onFileRemove,
  onFilesSelected,
  onSubmit,
  onVoiceToggle,
  setInput,
}: MiraChatBottomBarProps) {
  return (
    <div
      className={cn(
        'absolute right-0 bottom-0 left-0 z-10 flex min-w-0 max-w-full flex-col gap-2 p-3 transition-transform duration-300 ease-out sm:p-4',
        !bottomBarVisible && 'pointer-events-none translate-y-full'
      )}
    >
      {hasMessages && !isBusy ? (
        <div className="min-w-0 overflow-x-auto overflow-y-hidden">
          <QuickActionChips onSend={onSubmit} disabled={false} />
        </div>
      ) : null}
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

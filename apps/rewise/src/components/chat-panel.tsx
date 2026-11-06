/* eslint-disable no-unused-vars */

import type { UIMessage, UseChatHelpers } from '@tuturuuu/ai/types';
import { uploadAiChatFile } from '@tuturuuu/internal-api';
import type { RealtimePresenceState } from '@tuturuuu/internal-api/realtime';
import type { AIChat, AIModelUI } from '@tuturuuu/types';
import {
  FileUploader,
  type StatedFile,
} from '@tuturuuu/ui/custom/file-uploader';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useState } from 'react';
import { ChatPermissions } from '@/components/chat-permissions';
import { AssistantHeader } from './assistant-header';
import { AssistantToolbar } from './assistant-toolbar';
import { PromptForm } from './prompt-form';

interface PresenceUser {
  id: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
}

interface PresenceState {
  user: PresenceUser;
  online_at: string;
  presence_ref: string;
}

export interface ChatPanelProps
  extends Pick<
    UseChatHelpers<UIMessage>,
    'sendMessage' | 'status' | 'messages' | 'stop'
  > {
  id?: string;
  chat: Partial<AIChat> | undefined;
  chats?: AIChat[];
  count?: number | null;
  input: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  setInput: (input: string) => void;
  assistantName: string;
  model?: AIModelUI;
  createChat: (input: string) => Promise<void>;
  updateChat: (data: Partial<AIChat>) => Promise<void>;
  clearChat: () => void;
  initialMessages?: UIMessage[];
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  disabled?: boolean;
  presenceState?: RealtimePresenceState<PresenceState>;
  currentUserId?: string;
  apiKey?: string;
  apiKeyProvided?: boolean;
  wsId: string;
  workspaceSlug: string;
}

export function ChatPanel({
  id,
  chat,
  status,
  sendMessage,
  input,
  inputRef,
  setInput,
  assistantName,
  model,
  createChat,
  updateChat,
  clearChat,
  disabled,
  currentUserId,
  wsId,
  workspaceSlug,
}: ChatPanelProps) {
  const t = useTranslations('ai_chat');

  const [showDialog, setShowDialog] = useState(false);
  const [dialogType, setDialogType] = useState<'files' | 'visibility'>();

  const [files, setFiles] = useState<StatedFile[]>([]);

  const onUpload = async (files: StatedFile[]) => {
    await Promise.all(
      files.map(async (file) => {
        if (file.status === 'uploaded') return file;
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.url === file.url ? { ...file, status: 'uploading' as const } : f
          )
        );
        const { error, tempPath, finalPath } = await uploadFile(file, id, wsId);
        if (error) {
          console.error('File upload error:', error);
        }
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.url === file.url
              ? {
                  ...file,
                  status: error ? 'error' : 'uploaded',
                  tempPath,
                  finalPath,
                }
              : f
          )
        );
        return { file, error };
      })
    );
  };

  // Wrap createChat to move files after chat creation
  const handleCreateChat = async (input: string) => {
    await createChat(input);
  };

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <div className="absolute top-3 right-3 left-3 z-10 sm:top-4 sm:right-4 sm:left-4">
        <AssistantHeader
          onNewConversation={clearChat}
          onVisibility={
            id
              ? () => {
                  setDialogType('visibility');
                  setShowDialog(true);
                }
              : undefined
          }
          workspaceSlug={workspaceSlug}
        />
      </div>

      <div className="absolute right-0 bottom-0 left-0 z-10 flex min-w-0 max-w-full flex-col p-3 sm:p-4">
        <div className="mb-2 max-h-16 min-w-0 opacity-100">
          <AssistantToolbar model={model} wsId={wsId} />
        </div>
        <div className="min-w-0">
          <PromptForm
            assistantName={assistantName}
            onSubmit={async (value) => {
              if (!id) return await handleCreateChat(value);

              await sendMessage({
                role: 'user',
                parts: [{ type: 'text', text: value }],
              });
            }}
            files={files}
            setFiles={setFiles}
            input={input}
            inputRef={inputRef}
            setInput={setInput}
            isLoading={status === 'streaming'}
            toggleChatFileUpload={() => {
              setDialogType('files');
              setShowDialog((prev) => !prev);
            }}
            disabled={disabled}
          />
        </div>
      </div>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {dialogType === 'files' ? t('upload_files') : t('chat_visibility')}
          </DialogTitle>
          <DialogDescription>
            {dialogType === 'files'
              ? t('upload_file_description')
              : t('chat_visibility_description')}
          </DialogDescription>
        </DialogHeader>

        {dialogType === 'visibility' && (
          <ChatPermissions
            chatId={chat?.id || ''}
            isPublic={chat?.is_public || false}
            creatorId={chat?.creator_id || currentUserId || ''}
            currentUserId={currentUserId}
            onUpdateVisibility={(isPublic) =>
              updateChat({ is_public: isPublic })
            }
          />
        )}

        {dialogType === 'files' && (
          <div className="grid gap-4">
            <FileUploader
              value={files}
              onValueChange={setFiles}
              maxFileCount={10}
              maxSize={50 * 1024 * 1024}
              onUpload={onUpload}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Uploads a chat attachment through the owning server API, which checks
 * workspace membership and chat ownership before issuing a signed upload URL.
 * Without a chat id the server stores it under the caller's temp folder; the
 * AI route moves it into the chat on the first message.
 */
export async function uploadFile(
  file: StatedFile,
  chatId?: string,
  wsId?: string
): Promise<{
  data: unknown;
  error: unknown;
  tempPath: string | undefined;
  finalPath: string | undefined;
}> {
  if (!wsId)
    return {
      data: null,
      error: 'No workspace id provided',
      tempPath: undefined,
      finalPath: undefined,
    };

  try {
    const { path } = await uploadAiChatFile({
      chatId,
      file: file.rawFile,
      workspaceId: wsId,
    });
    return {
      data: { path },
      error: null,
      tempPath: chatId ? undefined : path,
      finalPath: chatId ? path : undefined,
    };
  } catch (error) {
    return {
      data: null,
      error,
      tempPath: undefined,
      finalPath: undefined,
    };
  }
}

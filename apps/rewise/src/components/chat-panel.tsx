/* eslint-disable no-unused-vars */

import type { UIMessage, UseChatHelpers } from '@tuturuuu/ai/types';
import { getCurrentUserProfile } from '@tuturuuu/internal-api';
import { createDynamicClient } from '@tuturuuu/supabase/next/client';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
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
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useState } from 'react';
import sanitize from 'sanitize-filename';
import { ChatPermissions } from '@/components/chat-permissions';
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
}

export function ChatPanel({
  id,
  chat,
  status,
  sendMessage,
  input,
  inputRef,
  setInput,
  model,
  createChat,
  updateChat,
  disabled,
  currentUserId,
  wsId,
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-linear-to-b from-transparent via-background/75 to-background px-3 pt-10 pb-3 sm:px-5 sm:pb-4">
        <div className="pointer-events-auto mx-auto max-w-3xl">
          <PromptForm
            id={id}
            model={model}
            chat={chat}
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
            toggleChatVisibility={() => {
              setDialogType('visibility');
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

  const fileName = sanitize(file.rawFile.name);

  let uploadPath = '';
  let tempPath: string | undefined;
  let finalPath: string | undefined;

  if (!chatId) {
    const user = await getCurrentUserProfile();

    if (!user?.id)
      return {
        data: null,
        error: 'No user id provided',
        tempPath: undefined,
        finalPath: undefined,
      };

    const randomId = `${dayjs().unix()}-${Math.random().toString(36).substring(2, 10)}`;
    const fileExtension = fileName.split('.').pop();
    uploadPath = `${wsId}/chats/ai/resources/temp/${user.id}/${randomId}.${fileExtension}`;
    tempPath = uploadPath;
  } else {
    uploadPath = `${wsId}/chats/ai/resources/${chatId}/${fileName}`;
    finalPath = uploadPath;
  }

  const sbDynamic = createDynamicClient();

  const { data, error } = await sbDynamic.storage
    .from('workspaces')
    .upload(uploadPath, file.rawFile);

  return { data, error, tempPath, finalPath };
}

/* eslint-disable no-unused-vars */
import { StorageObjectForm } from './ai-chat/file-upload';
import { ChatModelSelector } from './chat-model-selector';
import ApiKeyInput from './form-apikey';
import { PromptForm } from './prompt-form';
import { ChatPermissions } from '@/components/chat-permissions';
import { Model } from '@tuturuuu/ai/models';
import { type Message, type UseChatHelpers } from '@tuturuuu/ai/types';
import { createDynamicClient } from '@tuturuuu/supabase/next/client';
import { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import { AIChat } from '@tuturuuu/types/db';
import { FileUploader, StatedFile } from '@tuturuuu/ui/custom/file-uploader';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import React, { useState } from 'react';

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
    UseChatHelpers,
    | 'append'
    | 'isLoading'
    | 'reload'
    | 'messages'
    | 'stop'
    | 'input'
    | 'setInput'
  > {
  id?: string;
  chat: Partial<AIChat> | undefined;
  chats?: AIChat[];
  count?: number | null;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  model?: Model;
  setModel: (model: Model) => void;
  createChat: (input: string) => Promise<void>;
  updateChat: (data: Partial<AIChat>) => Promise<void>;
  clearChat: () => void;
  initialMessages?: Message[];
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
  isLoading,
  append,
  input,
  inputRef,
  setInput,
  model,
  setModel,
  createChat,
  updateChat,
  disabled,
  currentUserId,
  apiKey,
  wsId,
}: ChatPanelProps) {
  const t = useTranslations('ai_chat');

  const storagePath = `${id}/chats/ai/resources/${chat?.id}/`;
  const [showDialog, setShowDialog] = useState(false);
  const [dialogType, setDialogType] = useState<
    'files' | 'visibility' | 'api'
  >();
  const [showExtraOptions, setShowExtraOptions] = useState(false);

  const [files, setFiles] = useState<StatedFile[]>([]);

  const onUpload = async (files: StatedFile[]) => {
    await Promise.all(
      files.map(async (file) => {
        // If the file is already uploaded, skip it
        if (file.status === 'uploaded') return file;

        // Update the status to 'uploading'
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.url === file.url ? { ...file, status: 'uploading' } : f
          )
        );

        const { error } = await uploadFile(file, id, wsId);

        if (error) {
          console.error('File upload error:', error);
        }

        // Update the status to 'uploaded' or 'error'
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.url === file.url
              ? { ...file, status: error ? 'error' : 'uploaded' }
              : f
          )
        );

        return { file, error };
      })
    );
  };

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 bg-linear-to-b from-muted/30 from-0% to-muted/30 to-50% dark:from-background/0 dark:from-10% dark:to-background/80">
        <div className="pointer-events-auto mx-auto sm:max-w-2xl sm:px-4">
          <div className="space-y-4 border-t bg-background px-4 py-2 shadow-lg sm:rounded-t-xl sm:border md:py-4">
            {showExtraOptions && (
              <ChatModelSelector
                open={showExtraOptions}
                setOpen={setShowExtraOptions}
                model={model}
                onChange={setModel}
              />
            )}
            <PromptForm
              id={id}
              key={`${model?.provider}-${model?.value}`}
              provider={model?.provider}
              model={model?.label}
              chat={chat}
              onSubmit={async (value) => {
                // If there is no id, create a new chat
                if (!id) return await createChat(value);

                // If there is an id, append the message to the chat
                await append({
                  id,
                  content: value,
                  role: 'user',
                });
              }}
              files={files}
              setFiles={setFiles}
              input={input}
              inputRef={inputRef}
              setInput={setInput}
              isLoading={isLoading}
              showExtraOptions={showExtraOptions}
              setShowExtraOptions={setShowExtraOptions}
              toggleChatFileUpload={() => {
                setDialogType('files');
                setShowDialog((prev) => !prev);
              }}
              toggleChatVisibility={() => {
                setDialogType('visibility');
                setShowDialog((prev) => !prev);
              }}
              toggleAPIInput={() => {
                setDialogType('api');
                setShowDialog((prev) => !prev);
              }}
              disabled={disabled}
              apiKey={apiKey}
            />
          </div>
        </div>
      </div>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {dialogType === 'files'
              ? t('upload_files')
              : dialogType === 'api'
                ? t('api_input')
                : t('chat_visibility')}
          </DialogTitle>
          <DialogDescription>
            {dialogType === 'files' ? (
              t('upload_file_description')
            ) : dialogType === 'api' ? (
              <span className="flex flex-col gap-2">
                {t('api_input_description')}
                <br />
                <span className="flex items-center gap-2">
                  {t('get-api-key-from')}:
                  <Link
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline hover:no-underline"
                  >
                    Google AI Studio
                  </Link>
                </span>
              </span>
            ) : (
              t('chat_visibility_description')
            )}
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

        {dialogType === 'api' && (
          <div className="grid gap-4">
            <ApiKeyInput defaultValue={apiKey} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export async function uploadFile(
  file: StatedFile,
  id?: string,
  wsId?: string
): Promise<{ data: any; error: any }> {
  if (!id) return { data: null, error: 'No chat id provided' };

  const fileName = file.rawFile.name;
  const hasExtension = fileName.lastIndexOf('.') !== -1;
  const baseName = hasExtension
    ? fileName.substring(0, fileName.lastIndexOf('.'))
    : fileName;
  const fileExtension = hasExtension
    ? fileName.substring(fileName.lastIndexOf('.') + 1)
    : '';
  let newFileName = fileName;

  const supabase = createDynamicClient();

  // Check if a file with the same name already exists
  const { data: existingFileName } = await supabase
    .schema('storage')
    .from('objects')
    .select('*')
    .eq('bucket_id', 'workspaces')
    .not('owner', 'is', null)
    .eq('name', `${wsId}/chats/ai/resources/${id}/${fileName}`)
    .order('name', { ascending: true });

  const { data: existingFileNames } = await supabase
    .schema('storage')
    .from('objects')
    .select('*')
    .eq('bucket_id', 'workspaces')
    .not('owner', 'is', null)
    .ilike(
      'name',
      `${wsId}/chats/ai/resources/${id}/${baseName}(%).${fileExtension}`
    )
    .order('name', { ascending: true });

  if (existingFileName && existingFileName.length > 0) {
    if (existingFileNames && existingFileNames.length > 0) {
      const lastFileName = existingFileNames[existingFileNames.length - 1].name;
      const lastFileNameIndex = parseInt(
        lastFileName.substring(
          lastFileName.lastIndexOf('(') + 1,
          lastFileName.lastIndexOf(')')
        )
      );
      newFileName = `${baseName}(${lastFileNameIndex + 1}).${fileExtension}`;
    } else {
      newFileName = `${baseName}(1).${fileExtension}`;
    }
  }

  const { data, error } = await supabase.storage
    .from('workspaces')
    .upload(`${wsId}/chats/ai/resources/${id}/${newFileName}`, file.rawFile);

  return { data, error };
}

import type { Model } from '@tuturuuu/ai/models';
import type { Message, UseChatHelpers } from '@tuturuuu/ai/types';
import {
  createClient,
  createDynamicClient,
} from '@tuturuuu/supabase/next/client';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import type { AIChat } from '@tuturuuu/types/db';
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
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useState } from 'react';
import { ChatPermissions } from '@/components/chat-permissions';
import { ChatModelSelector } from './chat-model-selector';
import ApiKeyInput from './form-apikey';
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

  const [showDialog, setShowDialog] = useState(false);
  const [dialogType, setDialogType] = useState<
    'files' | 'visibility' | 'api'
  >();
  const [showExtraOptions, setShowExtraOptions] = useState(false);

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

  // Move files from temp to final location after chat creation
  // const moveFilesToChat = async (newChatId: string) => {
  //   const supabase = createDynamicClient();
  //   const updatedFiles = await Promise.all(
  //     files.map(async (file) => {
  //       if (file.status !== 'uploaded' || !file.tempPath) return file;
  //       const finalPath = `${wsId}/chats/ai/resources/${newChatId}/${file.rawFile.name}`;
  //       // Copy file from temp to final
  //       const { error: copyError } = await supabase.storage
  //         .from('workspaces')
  //         .copy(file.tempPath, finalPath);
  //       if (copyError) {
  //         console.error('File copy error:', copyError);
  //         return { ...file, status: 'error' as const };
  //       }
  //       // Delete temp file
  //       await supabase.storage.from('workspaces').remove([file.tempPath]);
  //       return {
  //         ...file,
  //         status: 'uploaded' as const,
  //         tempPath: undefined,
  //         finalPath,
  //       };
  //     })
  //   );
  //   setFiles(updatedFiles);
  // };

  // Wrap createChat to move files after chat creation
  const handleCreateChat = async (input: string) => {
    await createChat(input);
    // After chat is created, move files
    if (chat?.id) {
      // await moveFilesToChat(chat.id);
      console.log('Files moved to chat');
    }
    // You can add logic here to associate files with the prompt if needed
  };

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 bg-linear-to-b from-0% from-muted/30 to-50% to-muted/30 dark:from-10% dark:from-background/0 dark:to-background/80">
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
                if (!id) return await handleCreateChat(value);
                // If there is an id, append the message to the chat
                await append({
                  id,
                  content: value,
                  role: 'user',
                  // Optionally, you can add file references here if your backend supports it
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
): Promise<{
  data: unknown;
  error: unknown;
  tempPath?: string;
  finalPath?: string;
}> {
  if (!wsId) return { data: null, error: 'No workspace id provided' };
  const fileName = file.rawFile.name;
  let uploadPath = '';
  let tempPath: string | undefined;
  let finalPath: string | undefined;
  if (!id) {
    // Upload to temp path
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    uploadPath = `${wsId}/temp/${user?.user?.id}/${fileName}`;
    tempPath = uploadPath;
  } else {
    // Upload to final chat path
    uploadPath = `${wsId}/chats/ai/resources/${id}/${fileName}`;
    finalPath = uploadPath;
  }
  const supabaseStorage = createDynamicClient();
  const { data, error } = await supabaseStorage.storage
    .from('workspaces')
    .upload(uploadPath, file.rawFile);
  return { data, error, tempPath, finalPath };
}

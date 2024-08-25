import { ChatModelSelector } from './chat-model-selector';
import LoadingIndicator from './common/LoadingIndicator';
import { PromptForm } from './prompt-form';
import { ScrollToBottomButton } from './scroll-to-bottom-button';
import { ScrollToTopButton } from './scroll-to-top-button';
import { BASE_URL } from '@/constants/common';
import { Model } from '@/data/models';
import { AIChat } from '@/types/db';
import { createClient } from '@/utils/supabase/client';
import { generateRandomUUID } from '@/utils/uuid-helper';
import { Button } from '@repo/ui/components/ui/button';
import { FileUploader } from '@repo/ui/components/ui/custom/file-uploader';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import { ScrollArea } from '@repo/ui/components/ui/scroll-area';
import { Separator } from '@repo/ui/components/ui/separator';
import { cn } from '@repo/ui/lib/utils';
import { Message } from 'ai';
import { type UseChatHelpers } from 'ai/react';
import {
  ArrowDownToLine,
  Check,
  CheckCheck,
  ExternalLink,
  FolderOpen,
  Globe,
  LinkIcon,
  Lock,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { QRCode } from 'react-qrcode-logo';

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
  defaultRoute: string;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  model?: Model;
  setModel: (model: Model) => void;
  createChat: (input: string) => Promise<void>;
  updateChat: (data: Partial<AIChat>) => Promise<void>;
  clearChat: () => void;
  initialMessages?: Message[];
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export function ChatPanel({
  id,
  chat,
  chats,
  count,
  defaultRoute,
  isLoading,
  append,
  input,
  inputRef,
  setInput,
  model,
  setModel,
  createChat,
  updateChat,
  clearChat,
  collapsed,
  setCollapsed,
}: ChatPanelProps) {
  const t = useTranslations('ai_chat');
  const supabase = createClient();

  const [updating, setUpdating] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [showDialog, setShowDialog] = useState(false);
  const [dialogType, setDialogType] = useState<'files' | 'visibility'>();
  const [showExtraOptions, setShowExtraOptions] = useState(false);

  const disablePublicLink = isLoading || updating || !id || !chat?.is_public;

  const [chatInputHeight, setChatInputHeight] = useState(0);

  useEffect(() => {
    const chatInput = document.getElementById('chat-input');
    if (chatInput) setChatInputHeight(chatInput.clientHeight);
  }, [input]);

  const [files, setFiles] = useState<File[]>([]);
  const [fileProgresses, setFileProgresses] = useState<
    Record<string, 'uploading' | 'uploaded' | 'error'>
  >({});

  const onUpload = async (files: File[]) => {
    files.forEach(async (file) => {
      // if the file is already uploaded, skip it
      if (fileProgresses[file.name] === 'uploaded') return;

      // Set the status of the file to uploading
      setFileProgresses((prev) => ({
        ...prev,
        [file.name]: 'uploading',
      }));

      const { data: _, error } = await supabase.storage
        .from('workspaces')
        .upload(`test/${file.name}_${generateRandomUUID()}`, file);

      if (error) {
        setFileProgresses((prev) => ({
          ...prev,
          [file.name]: 'error',
        }));
        return;
      }

      // Set the status of the file to uploaded
      setFileProgresses((prev) => ({
        ...prev,
        [file.name]: 'uploaded',
      }));
    });
  };

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <div className="fixed inset-x-0 bottom-0">
        <div
          className={cn(
            'absolute z-10 flex items-end gap-2 md:flex-col',
            !!chats ? 'right-2 md:-right-2 lg:-right-6' : 'right-2 md:right-4'
          )}
          style={{
            bottom: chatInputHeight ? chatInputHeight + 4 : '1rem',
          }}
        >
          <ScrollToTopButton />
          <ScrollToBottomButton />

          {!!chats && count !== undefined && id && (
            <div className="flex w-full gap-2">
              <Button
                size="icon"
                variant="outline"
                className="bg-background/20 pointer-events-auto flex-none backdrop-blur-lg"
                onClick={() => setCollapsed(!collapsed)}
              >
                {collapsed ? (
                  <FolderOpen className="h-5 w-5" />
                ) : (
                  <ArrowDownToLine className="h-5 w-5" />
                )}
              </Button>
            </div>
          )}
        </div>

        {!!chats && count !== undefined && (
          <div
            id="chat-input"
            className="mx-auto flex flex-col gap-2 md:px-4 lg:max-w-4xl xl:max-w-6xl"
          >
            <div className="relative flex items-center justify-center gap-2">
              <div
                id="chat-sidebar"
                className={`absolute -bottom-1 z-20 w-full rounded-lg border-t p-2 transition-all duration-500 md:border ${
                  collapsed
                    ? 'pointer-events-none border-transparent bg-transparent'
                    : 'border-border bg-background shadow-lg'
                }`}
              >
                <div
                  className={`transition duration-300 ${
                    collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-foreground font-semibold">
                      {t('chats')}
                      {count ? (
                        <span className="opacity-50"> ({count})</span>
                      ) : (
                        ''
                      )}
                    </div>
                    <Separator className="my-2" />
                    <ScrollArea className="h-96">
                      <div className="grid w-full grid-cols-1 items-center justify-center gap-1 overflow-hidden md:grid-cols-2 lg:grid-cols-3">
                        {chats.length > 0 ? (
                          chats.map((chat) =>
                            chat.id === id ? (
                              <Button
                                key={chat.id}
                                variant="secondary"
                                className="inline-block w-full"
                                disabled
                              >
                                <div className="max-w-full truncate">
                                  {chat?.title || chat.id}
                                </div>
                              </Button>
                            ) : (
                              <Link
                                key={chat.id}
                                href={`${defaultRoute}/${chat.id}`}
                                className="w-full"
                              >
                                <Button
                                  variant="secondary"
                                  className="inline-block w-full"
                                  disabled={collapsed}
                                >
                                  <div className="max-w-full truncate">
                                    {chat?.title || chat.id}
                                  </div>
                                </Button>
                              </Link>
                            )
                          )
                        ) : (
                          <div className="text-foreground/60 mt-8 p-8">
                            {t('no_chats')}
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                    <Separator className="my-2" />
                    <div className="flex flex-row-reverse gap-2 lg:flex-row">
                      <Button
                        size="icon"
                        variant="secondary"
                        className={`flex-none ${
                          collapsed
                            ? 'pointer-events-none opacity-0'
                            : 'opacity-100'
                        } transition duration-300`}
                        onClick={() => setCollapsed(true)}
                      >
                        <ArrowDownToLine className="h-5 w-5" />
                      </Button>
                      <Link
                        href={defaultRoute}
                        className={`w-full ${
                          collapsed
                            ? 'pointer-events-none opacity-0'
                            : 'opacity-100'
                        } ${id ? '' : 'cursor-default'} transition duration-300`}
                        onClick={clearChat}
                      >
                        <Button className="w-full" disabled={!id || collapsed}>
                          <div className="line-clamp-1">{t('new_chat')}</div>
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              {/* {isLoading ? (
                <Button
                  variant="outline"
                  onClick={() => stop()}
                  className="bg-background/20"
                >
                  <IconStop className="mr-2" />
                  {t('stop_generating')}
                </Button>
              ) : null} */}
            </div>

            <div
              className={`bg-background/70 flex flex-col items-start justify-start rounded-xl border p-2 shadow-lg backdrop-blur-lg transition-all md:p-4`}
            >
              <ChatModelSelector
                open={showExtraOptions}
                model={model}
                className={`${
                  showExtraOptions
                    ? 'pointer-events-auto mb-2 opacity-100'
                    : 'pointer-events-none h-0 p-0 opacity-0'
                } transition-all ease-in-out`}
                setOpen={setShowExtraOptions}
                onChange={setModel}
              />
              <PromptForm
                id={id}
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
              />
            </div>
          </div>
        )}
      </div>

      <DialogContent>
        <div className="text-center">
          <DialogHeader className="mb-4">
            <DialogTitle>
              {dialogType === 'files'
                ? t('upload_files')
                : t('chat_visibility')}
            </DialogTitle>
            <DialogDescription>
              {dialogType === 'files'
                ? t('upload_file_description')
                : t('chat_visibility_description')}
            </DialogDescription>
          </DialogHeader>

          {dialogType === 'files' ? (
            <div className="grid gap-4">
              <FileUploader
                value={files}
                onValueChange={setFiles}
                maxFileCount={10}
                maxSize={50 * 1024 * 1024}
                progresses={fileProgresses}
                onUpload={onUpload}
                // disabled={isUploading}
              />
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={async () => {
                    setUpdating(true);
                    await updateChat({ is_public: true });
                    setCopiedLink(false);
                    setUpdating(false);
                  }}
                  disabled={!id || chat?.is_public}
                >
                  {chat?.is_public ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : updating ? (
                    <LoadingIndicator className="mr-2 h-4 w-4" />
                  ) : (
                    <Globe className="mr-2 h-4 w-4" />
                  )}
                  <div className="line-clamp-1">{t('public')}</div>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={async () => {
                    setUpdating(true);
                    await updateChat({ is_public: false });
                    setCopiedLink(false);
                    setUpdating(false);
                  }}
                  disabled={!id || !chat?.is_public}
                >
                  {!chat?.is_public ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : updating ? (
                    <LoadingIndicator className="mr-2 h-4 w-4" />
                  ) : (
                    <Lock className="mr-2 h-4 w-4" />
                  )}
                  <div className="line-clamp-1">{t('only_me')}</div>
                </Button>
              </div>

              {chat?.is_public && (
                <>
                  <Separator className="my-4" />

                  <div className="flex items-center justify-center">
                    <QRCode
                      value={`${BASE_URL}/ai/chats/${id}`}
                      size={256}
                      style={{
                        borderRadius: '0.5rem',
                      }}
                    />
                  </div>
                </>
              )}

              <Separator className="my-4" />

              <div className="grid w-full gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    navigator.clipboard.writeText(`${BASE_URL}/ai/chats/${id}`);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  disabled={disablePublicLink || copiedLink}
                >
                  {copiedLink ? (
                    <CheckCheck className="mr-2 h-4 w-4" />
                  ) : (
                    <LinkIcon className="mr-2 h-4 w-4" />
                  )}
                  {t('copy_public_link')}
                </Button>
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => window.open(`${BASE_URL}/ai/chats/${id}`)}
                  disabled={disablePublicLink}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('open_public_link')}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
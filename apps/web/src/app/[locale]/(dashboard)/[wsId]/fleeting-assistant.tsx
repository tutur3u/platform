import AssistantGradientName from './assistant-gradient-name';
import { FleetingAssistantMessage } from './fleeting-assistant-message';
import { AIChat } from '@/types/db';
import { zodResolver } from '@hookform/resolvers/zod';
import { useChat } from '@repo/ai/react';
import { type Message } from '@repo/ai/types';
import { Button } from '@repo/ui/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import { Separator } from '@repo/ui/components/ui/separator';
import { toast } from '@repo/ui/hooks/use-toast';
import { ArrowDownToLine, Expand, RotateCcw, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const FormSchema = z.object({
  prompt: z.string().min(1),
});

export default function FleetingAssistant({
  wsId,
  chat,
  model,
  messages,
  onBack,
  onReset,
  onSubmit: createChat,
}: {
  wsId: string;
  chat?: Partial<AIChat>;
  model: 'google';
  messages: Message[];
  onBack: () => void;
  onReset: () => void;
  // eslint-disable-next-line no-unused-vars
  onSubmit: (prompt: string) => Promise<Partial<AIChat> | undefined>;
}) {
  const t = useTranslations();

  const { isLoading, append, setMessages } = useChat({
    id: chat?.id,
    //   initialMessages,
    api: `/api/ai/chat/${model}`,
    body: {
      id: chat?.id,
      wsId,
    },
    onResponse(response) {
      if (!response.ok)
        toast({
          title: t('ai_chat.something_went_wrong'),
          description: t('ai_chat.try_again_later'),
        });
    },
    onError() {
      toast({
        title: t('ai_chat.something_went_wrong'),
        description: t('ai_chat.try_again_later'),
      });
    },
  });

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      prompt: '',
    },
  });

  const [pendingPrompt, setPendingPrompt] = useState<string | undefined>();

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    if (!!chat?.id && isLoading) return;

    setPendingPrompt(data.prompt);
    form.setValue('prompt', '');

    let currentChat = chat;

    if (!currentChat) {
      const newChat = await createChat(data.prompt);
      if (!newChat) {
        form.setValue('prompt', data.prompt);
        setPendingPrompt(undefined);
        return;
      }

      currentChat = newChat;
      setMessages([]);
    }

    await append({
      id: currentChat.id,
      role: 'user',
      content: data.prompt,
    });

    setPendingPrompt(undefined);
  }

  const currentMessages = useMemo(
    () =>
      messages.length === 0
        ? pendingPrompt
          ? [
              {
                id: 'pending',
                content: pendingPrompt,
                role: 'user',
              },
              {
                id: 'assistant-pending',
                content: t('common.waiting_for_response'),
                role: 'assistant',
              },
            ]
          : messages
        : messages,
    [t, messages, pendingPrompt]
  ) as Message[];

  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // on load, or when new messages are added, scroll to the bottom
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messagesRef, currentMessages]);

  useEffect(() => {
    // only set focus when device is not mobile
    if (window.innerWidth > 768) {
      form.setFocus('prompt');
    }
  }, [form, chat?.id]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[28.25rem] flex-col p-2">
        <div className="mb-2 flex items-center justify-between gap-2 transition">
          <div className="bg-foreground text-background w-fit rounded border px-2 py-0.5 font-mono text-xs font-bold">
            ALPHA
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setPendingPrompt(undefined);
                setMessages([]);
                form.reset();
                onReset();
              }}
              disabled={chat?.id === undefined || isLoading}
            >
              <RotateCcw className="h-5 w-5" />
            </Button>

            <Link href={`/${wsId}/chat${chat?.id ? `/${chat.id}` : ''}`}>
              <Button variant="ghost" size="icon" onClick={onBack}>
                <Expand className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>

        <div
          ref={messagesRef}
          className={`scrollbar-none flex h-full w-full flex-col items-center overflow-y-auto rounded-lg ${
            currentMessages.length > 0 ? 'justify-start' : 'justify-center'
          }`}
        >
          {currentMessages.length > 0 ? (
            <div className="grid h-fit w-full gap-2">
              {currentMessages.map((message, i) => (
                <FleetingAssistantMessage
                  key={i}
                  setInput={(value: string) => {
                    form.setValue('prompt', value);
                    form.trigger('prompt');
                  }}
                  message={{ ...message, content: message.content.trim() }}
                  model={chat?.model}
                />
              ))}
            </div>
          ) : (
            <div className="line-clamp-1 text-lg font-semibold md:text-2xl">
              <span className="opacity-30">Get started with</span>{' '}
              <AssistantGradientName />
              <span className="opacity-30">.</span>
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0">
        <Separator />
        <div className="flex items-center gap-1 p-2">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={onBack}
          >
            <ArrowDownToLine className="h-5 w-5" />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex w-full gap-1"
            >
              <FormField
                control={form.control}
                name="prompt"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormControl>
                      <Input
                        placeholder="Meet up with my team at 7pm"
                        className="w-full focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:ring-offset-transparent"
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                className="shrink-0"
                disabled={
                  !form.formState.isValid ||
                  (!!chat?.id && isLoading) ||
                  !!pendingPrompt
                }
              >
                <Send className="h-5 w-5" />
              </Button>
            </form>
          </Form>

          {/* <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={onBack}
        >
          <EllipsisHorizontalIcon className="h-5 w-5" />
        </Button> */}
        </div>
      </div>
    </div>
  );
}

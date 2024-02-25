import { Button } from '@/components/ui/button';
import { ArrowLeftIcon, PaperAirplaneIcon } from '@heroicons/react/20/solid';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import AssistantGradientName from './assistant-gradient-name';
import { useEffect, useMemo, useRef, useState } from 'react';
import useTranslation from 'next-translate/useTranslation';
import { toast } from '@/components/ui/use-toast';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AIChat } from '@/types/primitives/ai-chat';
import { FleetingAssistantMessage } from './fleeting-assistant-message';
import { Expand } from 'lucide-react';
import { Message } from 'ai';
import Link from 'next/link';
import { useChat } from 'ai/react';

const FormSchema = z.object({
  prompt: z.string().min(1),
});

export default function FleetingAssistant({
  wsId,
  chat,
  model,
  messages,
  onBack,
  onSubmit: createChat,
}: {
  wsId: string;
  chat?: AIChat;
  model: 'google' | 'anthropic';
  messages: Message[];
  onBack: () => void;
  onSubmit: (prompt: string) => Promise<AIChat>;
}) {
  const { t } = useTranslation('ai-chat');

  const { isLoading, append } = useChat({
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
          title: t('something_went_wrong'),
          description: t('try_again_later'),
        });
    },
    onError(_) {
      toast({
        title: t('something_went_wrong'),
        description: t('try_again_later'),
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
    if (isLoading) return;

    setPendingPrompt(data.prompt);
    form.setValue('prompt', '');

    const currentChat = await createChat(data.prompt);

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
            ]
          : messages
        : messages,
    [messages, pendingPrompt]
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
        <div className="mb-2 flex items-center justify-end gap-2 transition">
          <div className="bg-foreground text-background w-fit rounded border px-2 py-0.5 font-mono text-xs font-bold">
            ALPHA
          </div>

          <Link href={`/${wsId}/chat${chat?.id ? `/${chat.id}` : ''}`}>
            <Button variant="ghost" size="icon" onClick={onBack}>
              <Expand className="h-5 w-5" />
            </Button>
          </Link>
        </div>

        <div
          ref={messagesRef}
          className="scrollbar-none flex h-full w-full flex-col items-center justify-center overflow-y-auto rounded-lg"
        >
          {currentMessages.length > 0 ? (
            <div className="grid h-full w-full gap-2">
              {currentMessages.map((message, i) => (
                <FleetingAssistantMessage
                  key={i}
                  message={{ ...message, content: message.content.trim() }}
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
      <div className="flex-shrink-0">
        <Separator />
        <div className="flex items-center gap-1 p-2">
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0"
            onClick={onBack}
          >
            <ArrowLeftIcon className="h-5 w-5" />
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
                        className="bg-secondary/70 w-full focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:ring-offset-transparent"
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
                className="flex-shrink-0"
                disabled={!form.formState.isValid || isLoading}
              >
                <PaperAirplaneIcon className="h-5 w-5" />
              </Button>
            </form>
          </Form>

          {/* <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0"
          onClick={onBack}
        >
          <EllipsisHorizontalIcon className="h-5 w-5" />
        </Button> */}
        </div>
      </div>
    </div>
  );
}

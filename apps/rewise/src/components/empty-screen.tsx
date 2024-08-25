import { capitalize, cn } from '@/lib/utils';
import { AIChat } from '@/types/db';
import { Button } from '@repo/ui/components/ui/button';
import { IconArrowRight } from '@repo/ui/components/ui/icons';
import { Separator } from '@repo/ui/components/ui/separator';
import { UseChatHelpers } from 'ai/react';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Box, Globe, Lock, MessageCircle, Sparkle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export function EmptyScreen({
  chats,
  setInput,
  locale,
}: Pick<UseChatHelpers, 'setInput'> & {
  chats?: AIChat[];
  locale: string;
}) {
  dayjs.extend(relativeTime);
  dayjs.locale(locale);

  const t = useTranslations('ai_chat');

  const exampleMessages = [
    {
      heading: t('example_1'),
      message: t('example_1_prompt'),
    },
    {
      heading: t('example_2'),
      message: t('example_2_prompt'),
    },
    {
      heading: t('example_3'),
      message: t('example_3_prompt'),
    },
    {
      heading: t('example_4'),
      message: t('example_4_prompt'),
    },
    {
      heading: t('example_5'),
      message: t('example_5_prompt'),
    },
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 lg:max-w-4xl xl:max-w-6xl">
      <div className="bg-background rounded-lg border p-4 md:p-8">
        <h1 className="mb-2 text-lg font-semibold">
          {t('welcome_to')}{' '}
          <span className="from-dynamic-red via-dynamic-purple to-dynamic-sky overflow-hidden bg-gradient-to-r bg-clip-text font-bold text-transparent">
            Rewise
          </span>
          .
        </h1>
        <p className="text-foreground/90 text-sm leading-normal md:text-base">
          {t('welcome_msg')}
        </p>

        <div className="mt-4 flex w-fit max-w-full flex-col gap-2">
          {exampleMessages.map((message, index) => (
            <Button
              key={index}
              variant="link"
              className="h-auto w-fit max-w-full justify-start p-0 text-left text-base"
              onClick={() => setInput(message.message)}
            >
              <IconArrowRight className="text-foreground/80 mr-2 shrink-0" />
              <div className="w-fit max-w-full truncate">{message.heading}</div>
            </Button>
          ))}
        </div>

        {chats && chats.length > 0 && (
          <>
            <Separator className="my-4" />
            <div>
              <h2 className="line-clamp-1 text-lg font-semibold">
                {t('recent_conversations')}
              </h2>
              <div className="mt-4 flex flex-col items-start space-y-2">
                {chats.slice(0, 3).map((chat) => (
                  <div key={chat.id} className="flex w-full items-center gap-2">
                    <MessageCircle className="text-foreground/80 shrink-0" />
                    <div className="flex w-full flex-col items-start">
                      <Link
                        href={`/c/${chat.id}`}
                        className="text-sm hover:underline md:text-base"
                      >
                        {chat.title}
                      </Link>

                      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded border px-1 py-0.5 font-mono font-semibold lowercase',
                            chat.is_public
                              ? 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20'
                              : 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20'
                          )}
                        >
                          {chat.is_public ? (
                            <>
                              <Globe className="h-3 w-3" />
                              {t('public')}
                            </>
                          ) : (
                            <>
                              <Lock className="h-3 w-3" />
                              {t('only_me')}
                            </>
                          )}
                        </span>
                        {chat.model && (
                          <span className="bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/20 inline-flex items-center gap-1 rounded border px-1 py-0.5 font-mono font-semibold lowercase">
                            <Sparkle className="h-3 w-3" />
                            {chat.model}
                          </span>
                        )}
                        {chat.summary && (
                          <span className="bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/20 inline-flex items-center gap-1 rounded border px-1 py-0.5 font-mono font-semibold lowercase">
                            <Box className="h-3 w-3" />
                            {t('summarized')}
                          </span>
                        )}
                        <span className="opacity-70">
                          {chat.model && <span className="mr-1">•</span>}
                          {capitalize(dayjs(chat?.created_at).fromNow())}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { type UseChatHelpers } from '@ncthub/ai/types';
import { AIChat } from '@ncthub/types/db';
import { Button } from '@ncthub/ui/button';
import {
  ArrowDownToDot,
  Box,
  Globe,
  GraduationCap,
  Lock,
  Mail,
  MessageCircle,
  Microscope,
  NotebookPen,
  Sigma,
  Sparkle,
} from '@ncthub/ui/icons';
import { Separator } from '@ncthub/ui/separator';
import { capitalize, cn } from '@ncthub/utils/format';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export function EmptyScreen({
  wsId,
  chats,
  setInput,
  locale,
}: Pick<UseChatHelpers, 'setInput'> & {
  wsId?: string;
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
      color: 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
      icon: <Microscope />,
    },
    {
      heading: t('example_2'),
      message: t('example_2_prompt'),
      color: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20',
      icon: <Sigma />,
    },
    {
      heading: t('example_3'),
      message: t('example_3_prompt'),
      color:
        'bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/20',
      icon: <GraduationCap />,
    },
    {
      heading: t('example_4'),
      message: t('example_4_prompt'),
      color:
        'bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/20',
      icon: <ArrowDownToDot />,
    },
    {
      heading: t('example_5'),
      message: t('example_5_prompt'),
      color: 'bg-dynamic-sky/10 text-dynamic-sky border-dynamic-sky/20',
      icon: <Mail />,
    },
    {
      heading: t('example_6'),
      message: t('example_6_prompt'),
      color: 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20',
      icon: <NotebookPen />,
    },
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 @lg:max-w-4xl @xl:max-w-6xl">
      <div className="rounded-lg border bg-background p-4 @md:p-8">
        <div className="flex flex-col items-center justify-center text-center">
          <h1 className="mb-2 text-lg font-semibold">
            {t('welcome_to')}{' '}
            <span className="overflow-hidden bg-linear-to-r from-dynamic-red via-dynamic-purple to-dynamic-sky bg-clip-text font-bold text-transparent">
              Rewise
            </span>
            .
          </h1>
          <p className="text-sm leading-normal text-foreground/90 md:text-base">
            {t('welcome_msg')}
          </p>

          <div className="mt-4 grid w-full gap-2 @md:grid-cols-2 @xl:grid-cols-3">
            {exampleMessages.map((message, index) => (
              <Button
                key={index}
                variant="link"
                className={cn(
                  'w-full items-center justify-center gap-2 border p-2 text-left text-sm',
                  message.color
                )}
                onClick={() => setInput(message.message)}
              >
                {message.icon}
                <div className="line-clamp-1 break-all whitespace-normal">
                  {message.heading}
                </div>
              </Button>
            ))}
          </div>
        </div>

        {chats && chats.length > 0 && (
          <>
            <Separator className="my-4" />
            <div>
              <h2 className="line-clamp-1 text-lg font-semibold">
                {t('recent_conversations')}
              </h2>
              <div className="mt-2 grid items-start gap-2 @lg:grid-cols-2">
                {chats.slice(0, 2).map((chat) => (
                  <div
                    key={chat.id}
                    className="flex w-full items-center gap-2 rounded border bg-foreground/5 p-2"
                  >
                    <MessageCircle className="shrink-0 text-foreground/80" />
                    <div className="flex w-full flex-col items-start">
                      <Link
                        href={`/${wsId}/chat/${chat.id}`}
                        className="line-clamp-1 text-sm hover:underline md:text-base"
                      >
                        {chat.title}
                      </Link>

                      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded border px-1 py-0.5 font-mono font-semibold lowercase',
                            chat.is_public
                              ? 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green'
                              : 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red'
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
                          <span className="inline-flex items-center gap-1 rounded border border-dynamic-yellow/20 bg-dynamic-yellow/10 px-1 py-0.5 font-mono font-semibold text-dynamic-yellow lowercase">
                            <Sparkle className="h-3 w-3" />
                            {chat.model}
                          </span>
                        )}
                        {chat.summary && (
                          <span className="inline-flex items-center gap-1 rounded border border-dynamic-purple/20 bg-dynamic-purple/10 px-1 py-0.5 font-mono font-semibold text-dynamic-purple lowercase">
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

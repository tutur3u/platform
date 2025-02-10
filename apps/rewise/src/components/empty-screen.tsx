import { cn } from '@/lib/utils';
import { type UseChatHelpers } from '@tutur3u/ai/types';
import { AIChat } from '@tutur3u/types/db';
import { Button } from '@tutur3u/ui/components/ui/button';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  ArrowDownToDot,
  GraduationCap,
  Mail,
  Microscope,
  NotebookPen,
  Sigma,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export function EmptyScreen({
  // chats,
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
    <div className="mx-auto flex max-w-2xl flex-col gap-4 lg:max-w-4xl xl:max-w-6xl">
      <div className="bg-background rounded-lg border p-4 md:p-8">
        <div className="flex flex-col items-center justify-center text-center">
          <h1 className="mb-2 text-lg font-semibold">
            {t('welcome_to')}{' '}
            <span className="from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue overflow-hidden bg-gradient-to-r bg-clip-text font-bold text-transparent">
              Rewise
            </span>
            .
          </h1>
          <p className="text-foreground/90 text-sm leading-normal md:text-base">
            {t('welcome_msg')}
          </p>

          <div className="mt-4 grid w-full gap-2 md:grid-cols-2 xl:grid-cols-3">
            {exampleMessages.map((message, index) => (
              <Button
                key={index}
                variant="link"
                className={cn(
                  'w-full items-center justify-center gap-2 border p-2 text-left text-sm md:p-8',
                  message.color
                )}
                onClick={() => setInput(message.message)}
              >
                {message.icon}
                <div className="line-clamp-1 whitespace-normal break-all">
                  {message.heading}
                </div>
              </Button>
            ))}
          </div>
        </div>

        {/* {chats && chats.length > 0 && (
          <>
            <Separator className="my-4" />
            <div>
              <h2 className="line-clamp-1 text-lg font-semibold">
                {t('recent_conversations')}
              </h2>
              <div className="mt-2 grid items-start gap-2 lg:grid-cols-2">
                {chats.slice(0, 2).map((chat) => (
                  <div
                    key={chat.id}
                    className="bg-foreground/5 flex w-full items-center gap-2 rounded border p-2"
                  >
                    <MessageCircle className="text-foreground/80 shrink-0" />
                    <div className="flex w-full flex-col items-start">
                      <Link
                        href={`/c/${chat.id}`}
                        className="line-clamp-1 text-sm hover:underline md:text-base"
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
        )} */}
      </div>
    </div>
  );
}

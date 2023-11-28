'use-client';

import { UseChatHelpers } from 'ai/react';
import { Button } from '@/components/ui/button';
import { IconArrowRight } from '@/components/ui/icons';
import { AIChat } from '@/types/primitives/ai-chat';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Message } from 'ai';
import { ChatList } from './chat-list';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import useTranslation from 'next-translate/useTranslation';
import { Separator } from './ui/separator';

export function EmptyScreen({
  wsId,
  chats,
  count,
  setInput,
  previousMessages,
  locale,
}: Pick<UseChatHelpers, 'setInput'> & {
  wsId: string;
  chats: AIChat[];
  count: number | null;
  previousMessages?: Message[];
  locale?: string;
}) {
  dayjs.extend(relativeTime);
  dayjs.locale(locale);

  const { t } = useTranslation('ai-chat');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme?.includes('dark');

  const exampleMessages = [
    {
      heading: 'Explain technical concepts',
      message: `What is quantum computing?`,
    },
    {
      heading: 'Generate math problems',
      message: `Generate a list of hard but interesting math problems for undergraduates.`,
    },
    {
      heading: 'Explain to a 5th grader',
      message: `Explain the following concepts like I'm a fifth grader: \n\n`,
    },
    {
      heading: 'Summarize an article',
      message: 'Summarize the following article for a 2nd grader: \n\n',
    },
    {
      heading: 'Draft an email',
      message: `Draft an email to my boss about the following: \n\n`,
    },
  ];

  return (
    <div className="mx-auto grid max-w-2xl gap-4 lg:max-w-4xl xl:max-w-6xl">
      <div className="bg-background rounded-lg border p-4 md:p-8">
        <h1 className="mb-2 text-lg font-semibold">
          {t('welcome_to')}{' '}
          <span
            className={`bg-gradient-to-r bg-clip-text font-bold text-transparent ${
              isDark
                ? 'from-pink-300 via-amber-300 to-blue-300'
                : 'from-pink-600 via-yellow-500 to-sky-600'
            }`}
          >
            Tuturuuu AI
          </span>{' '}
          Chat.
        </h1>
        <p className="text-foreground/90 text-sm leading-normal md:text-base">
          {t('welcome_msg')}
        </p>

        <div className="mt-4 flex flex-col items-start space-y-2">
          {exampleMessages.map((message, index) => (
            <Button
              key={index}
              variant="link"
              className="h-auto p-0 text-left text-base"
              onClick={() => setInput(message.message)}
            >
              <IconArrowRight className="text-foreground/80 mr-2 flex-none" />
              {message.heading}
            </Button>
          ))}
        </div>

        <Separator className="my-4" />

        {chats.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold">
              {t('recent_conversations')}
            </h2>
            <div className="mt-4 flex flex-col items-start space-y-2">
              {chats.slice(0, 5).map((chat, index) => (
                <Link href={`/${wsId}/chat/${chat.id}`} key={chat.id}>
                  <Button
                    key={index}
                    variant="link"
                    className="h-auto p-0 text-left text-base"
                  >
                    <MessageCircle className="text-foreground/80 mr-2 flex-none" />
                    <div>
                      <div>{chat.title}</div>
                      <div className="opacity-50">
                        {chat?.created_at
                          ? dayjs(chat?.created_at).fromNow()
                          : null}
                      </div>
                    </div>
                  </Button>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {previousMessages && previousMessages.length > 0 && (
        <div className="bg-background rounded-lg border p-4 md:p-8">
          <div>
            <h2 className="text-lg font-semibold">{t('latest_messages')}</h2>
            <Separator className="mb-8 mt-4" />
            <div className="flex flex-col items-start space-y-2">
              <ChatList
                messages={previousMessages.map((message) => {
                  // If there is 2 repeated substring in the
                  // message, we will merge them into one
                  const content = message.content;
                  const contentLength = content.length;
                  const contentHalfLength = Math.floor(contentLength / 2);

                  const firstHalf = content.substring(0, contentHalfLength);

                  const secondHalf = content.substring(
                    contentHalfLength,
                    contentLength
                  );

                  if (firstHalf === secondHalf) message.content = firstHalf;
                  return message;
                })}
                setInput={setInput}
                embeddedUrl={`/${wsId}/chat`}
              />
            </div>
          </div>
        </div>
      )}

      {chats.length > 5 && (
        <div className="bg-background rounded-lg border p-4 md:p-8">
          <div>
            <h2 className="text-lg font-semibold">
              {t('all_conversations')}{' '}
              {count ? (
                <span className="bg-foreground/10 text-foreground rounded-full border px-2 py-0.5 text-sm">
                  {count}
                </span>
              ) : (
                ''
              )}
            </h2>

            <Separator className="mb-8 mt-4" />

            <div className="flex flex-col items-start space-y-2">
              {chats.map((chat, index) => (
                <Link href={`/${wsId}/chat/${chat.id}`} key={chat.id}>
                  <Button
                    key={index}
                    variant="link"
                    className="h-auto p-0 text-left text-base"
                  >
                    <MessageCircle className="text-foreground/80 mr-2 flex-none" />
                    <div>
                      <div>{chat.title}</div>
                      <div className="opacity-50">
                        {chat?.created_at
                          ? dayjs(chat?.created_at).fromNow()
                          : null}
                      </div>
                    </div>
                  </Button>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

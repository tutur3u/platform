import { UseChatHelpers } from 'ai/react';

import { Button } from '@/components/ui/button';
import { IconArrowRight } from '@/components/ui/icons';
import { AIChat } from '@/types/primitives/ai-chat';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { useTheme } from 'next-themes';

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
    heading: 'Write a poem',
    message: `Write a poem about the following topics: \n\n`,
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

export function EmptyScreen({
  wsId,
  chats,
  count,
  setInput,
}: Pick<UseChatHelpers, 'setInput'> & {
  wsId: string;
  chats: AIChat[];
  count: number | null;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme?.includes('dark');

  return (
    <div className="mx-auto max-w-2xl lg:max-w-4xl">
      <div className="bg-background rounded-lg border p-8">
        <h1 className="mb-2 text-lg font-semibold">
          Welcome to{' '}
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
        <p className="text-muted-foreground leading-normal">
          You can start a conversation here or try the following examples:
        </p>
        <div className="mt-4 flex flex-col items-start space-y-2">
          {exampleMessages.map((message, index) => (
            <Button
              key={index}
              variant="link"
              className="h-auto p-0 text-left text-base"
              onClick={() => setInput(message.message)}
            >
              <IconArrowRight className="text-muted-foreground mr-2 flex-none" />
              {message.heading}
            </Button>
          ))}
        </div>
        {chats.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold">
              Recent conversations
              {count ? <span className="opacity-50"> ({count})</span> : ''}
            </h2>
            <div className="mt-4 flex flex-col items-start space-y-2">
              {chats.map((chat, index) => (
                <Link href={`/${wsId}/chat/${chat.id}`} key={chat.id}>
                  <Button
                    key={index}
                    variant="link"
                    className="h-auto p-0 text-left text-base"
                  >
                    <MessageCircle className="text-muted-foreground mr-2 flex-none" />
                    {chat.title}
                  </Button>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

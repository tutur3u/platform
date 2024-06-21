'use client';

// Inspired by Chatbot-UI and modified to fit the needs of this project
// @see https://github.com/mckaywrigley/chatbot-ui/blob/main/components/Chat/ChatMessage.tsx
import { ChatMessageActions } from '@/components/chat-message-actions';
import { MemoizedReactMarkdown } from '@/components/markdown';
import { capitalize, cn } from '@/lib/utils';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/ui/components/ui/avatar';
import { CodeBlock } from '@repo/ui/components/ui/codeblock';
import { IconUser } from '@repo/ui/components/ui/icons';
import { Separator } from '@repo/ui/components/ui/separator';
import { Message } from 'ai';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'katex/dist/katex.min.css';
import { Bot, Send, Sparkle } from 'lucide-react';
import { useTheme } from 'next-themes';
import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';
import { useState } from 'react';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

export interface ChatMessageProps {
  message: Message & {
    chat_id?: string;
    model?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    created_at?: string;
  };
  embeddedUrl?: string;
  locale?: string;
  anonymize?: boolean;
  setInput?: (input: string) => void;
}

export function ChatMessage({
  message,
  embeddedUrl,
  locale = 'en',
  anonymize,
  setInput,
  ...props
}: ChatMessageProps) {
  dayjs.extend(relativeTime);
  dayjs.locale(locale);

  const { t } = useTranslation('ai-chat');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme?.includes('dark');

  return (
    <div
      className={cn('group relative mb-4 grid h-fit w-full gap-4')}
      {...props}
    >
      <div className="flex h-fit flex-wrap justify-between gap-2">
        <div className="flex h-fit w-fit select-none items-center space-x-2 rounded-lg">
          <div
            className={cn(
              'bg-foreground/10 text-foreground flex h-12 w-12 shrink-0 items-center justify-center rounded-md border shadow'
            )}
          >
            {message.role === 'user' ? (
              <IconUser className="h-5 w-5" />
            ) : (
              <Avatar className="h-12 w-12 rounded-md">
                <AvatarImage src="/media/logos/light.png" alt="Skora" />
                <AvatarFallback className="rounded-lg font-semibold">
                  AI
                </AvatarFallback>
              </Avatar>
            )}
          </div>
          <div className="flex flex-col justify-between">
            <span className="line-clamp-1 font-semibold">
              {message.role === 'user' ? (
                anonymize ? (
                  t('anonymous')
                ) : (
                  t('you')
                )
              ) : (
                <span
                  className={`overflow-hidden bg-gradient-to-r bg-clip-text font-bold text-transparent ${
                    isDark
                      ? 'from-pink-300 via-amber-200 to-blue-300'
                      : 'from-pink-600 via-purple-500 to-sky-500'
                  }`}
                >
                  Skora
                </span>
              )}
            </span>

            <div className="text-xs flex flex-wrap gap-1 items-center">
              {message.model && (
                <span className="hidden font-semibold md:inline-flex items-center gap-1 font-mono px-1 py-0.5 border border-dynamic-yellow/10 text-dynamic-yellow rounded bg-dynamic-yellow/10">
                  <Sparkle className="w-3 h-3" />
                  {message.model}
                </span>
              )}
              {message.prompt_tokens !== undefined &&
                message.prompt_tokens !== 0 && (
                  <span className="font-semibold inline-flex items-center gap-1 font-mono px-1 py-0.5 border border-dynamic-green/10 text-dynamic-green rounded bg-dynamic-green/10">
                    <Send className="w-3 h-3" />
                    {Intl.NumberFormat(locale).format(message.prompt_tokens)}
                  </span>
                )}
              {message.completion_tokens !== undefined &&
                message.completion_tokens !== 0 && (
                  <span className="font-semibold inline-flex items-center gap-1 font-mono px-1 py-0.5 border border-dynamic-purple/10 text-dynamic-purple rounded bg-dynamic-purple/10">
                    <Bot className="w-3 h-3" />
                    {Intl.NumberFormat(locale).format(
                      message.completion_tokens
                    )}
                  </span>
                )}
              <span className="opacity-70">
                {message.model ||
                message.prompt_tokens ||
                message.completion_tokens
                  ? '• '
                  : ''}
                {capitalize(dayjs(message?.created_at).fromNow())}
              </span>
            </div>
          </div>
        </div>

        <ChatMessageActions message={message} />
      </div>

      <div className="flex-1 space-y-2">
        <MemoizedReactMarkdown
          className="text-foreground prose prose-p:before:hidden prose-p:after:hidden prose-li:marker:text-foreground/80 prose-code:before:hidden prose-code:after:hidden prose-th:border-foreground/20 prose-th:border prose-th:text-center prose-th:text-lg prose-th:p-2 prose-td:p-2 prose-th:border-b-4 prose-td:border prose-tr:border-border dark:prose-invert prose-p:leading-relaxed prose-pre:p-2 w-[calc(100vw-8rem)] min-w-full break-words md:w-[38rem] lg:w-full"
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            h1({ children }) {
              return <h1 className="text-foreground mb-2 mt-6">{children}</h1>;
            },
            h2({ children }) {
              return <h2 className="text-foreground mb-2 mt-6">{children}</h2>;
            },
            h3({ children }) {
              return <h3 className="text-foreground mb-2 mt-6">{children}</h3>;
            },
            h4({ children }) {
              return <h4 className="text-foreground mb-2 mt-6">{children}</h4>;
            },
            h5({ children }) {
              return <h5 className="text-foreground mb-2 mt-6">{children}</h5>;
            },
            h6({ children }) {
              return <h6 className="text-foreground mb-2 mt-6">{children}</h6>;
            },
            strong({ children }) {
              return (
                <strong className="text-foreground font-semibold">
                  {children}
                </strong>
              );
            },
            a({ children, href }) {
              if (!href) return <>{children}</>;

              return (
                <Link href={href} className="text-foreground hover:underline">
                  {children}
                </Link>
              );
            },
            p({ children }) {
              // Quiz component
              if (
                Array.isArray(children) &&
                children.length > 0 &&
                children[0] === '@' &&
                children.some(
                  (child) =>
                    typeof child === 'string' && child.startsWith('<QUIZ>')
                )
              ) {
                const quizContent = children.join('');
                const questionMatch = quizContent.match(
                  /<QUESTION>(.*?)<\/QUESTION>/
                );
                const question = questionMatch
                  ? questionMatch[1]
                  : 'No question found';

                const optionsMatches = Array.from(
                  quizContent.matchAll(
                    /<OPTION(?: isCorrect)?>(.*?)<\/OPTION>/g
                  )
                );

                const options = optionsMatches.map((match) => ({
                  isCorrect: match[0].includes('isCorrect'),
                  text: match?.[1]?.trim() || '',
                }));

                const [selectedOption, setSelectedOption] = useState<{
                  isCorrect: boolean;
                  text: string;
                }>({ isCorrect: false, text: '' });
                const [revealCorrect, setRevealCorrect] = useState(false);

                const handleOptionClick = (option: {
                  isCorrect: boolean;
                  text: string;
                }) => {
                  if (revealCorrect) return;

                  setSelectedOption(option);
                  setRevealCorrect(true);
                };

                const questionElement = (
                  <div className="text-lg font-bold text-foreground">
                    {question}
                  </div>
                );

                const optionsElements = options.map((option, index) => (
                  <button
                    key={index}
                    className={`font-semibold w-full rounded border text-left md:text-center transition px-3 py-1 ${
                      revealCorrect && option.isCorrect
                        ? 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green'
                        : revealCorrect
                          ? 'bg-foreground/5 text-foreground opacity-50'
                          : 'bg-foreground/5 hover:bg-foreground/10 text-foreground'
                    }`}
                    onClick={() => handleOptionClick(option)}
                  >
                    {option.text}
                  </button>
                ));

                return (
                  <div className="mt-4 flex flex-col items-center justify-center border bg-foreground/5 rounded-lg w-full p-4">
                    {questionElement}
                    <Separator className="my-2" />
                    <div
                      className={`grid md:grid-cols-2 gap-2 w-full ${
                        options.length === 3
                          ? 'xl:grid-cols-3'
                          : 'xl:grid-cols-4'
                      }`}
                    >
                      {optionsElements}
                    </div>
                    {revealCorrect && (
                      <>
                        <div className="mt-4">
                          <span className="opacity-70">
                            {t('correct_answer_is_highlighed')}.{' '}
                            {t('you_selected')}{' '}
                          </span>
                          <span className="font-semibold">
                            {selectedOption.text}
                          </span>
                          <span className="opacity-70">, {t('which_is')} </span>
                          {selectedOption.isCorrect ? (
                            <span className="font-semibold underline text-dynamic-green">
                              {t('correct')}
                            </span>
                          ) : (
                            <span className="font-semibold underline text-dynamic-red">
                              {t('incorrect')}
                            </span>
                          )}
                          <span className="opacity-70">.</span>
                        </div>

                        <Separator className="my-4" />
                        <div className="w-full text-sm text-center font-semibold p-1 rounded border border-dynamic-purple/20 text-dynamic-purple bg-dynamic-purple/10">
                          {t('experimental_disclaimer')}
                        </div>
                      </>
                    )}
                  </div>
                );
              }

              // Flashcard component
              if (
                Array.isArray(children) &&
                children.length > 0 &&
                children[0] === '@' &&
                children.some(
                  (child) =>
                    typeof child === 'string' && child.startsWith('<FLASHCARD>')
                )
              ) {
                const flashcardContent = children.join('');
                const questionMatch = flashcardContent.match(
                  /<QUESTION>(.*?)<\/QUESTION>/
                );
                const question = questionMatch
                  ? questionMatch[1]
                  : 'No question found';

                const answerMatch = flashcardContent.match(
                  /<ANSWER>(.*?)<\/ANSWER>/
                );
                const answer = answerMatch ? answerMatch[1] : 'No answer found';

                const [revealAnswer, setRevealAnswer] = useState(false);

                return (
                  <div className="mt-4 flex flex-col items-center justify-center border bg-foreground/5 rounded-lg w-full p-4">
                    <div className="text-lg font-bold text-foreground">
                      {question}
                    </div>
                    <Separator className="mt-2 mb-4" />
                    <button
                      className={`font-semibold w-full rounded border text-center transition duration-300 px-3 py-1 text-foreground ${
                        revealAnswer
                          ? 'cursor-default border-transparent'
                          : 'bg-foreground/5 hover:bg-foreground/10'
                      }`}
                      onClick={() => setRevealAnswer(true)}
                    >
                      {revealAnswer ? (
                        <>
                          <div className="text-dynamic-yellow">{answer}</div>
                          <Separator className="my-4" />
                          <div className="w-full text-sm text-center p-1 rounded border border-dynamic-purple/20 text-dynamic-purple bg-dynamic-purple/10">
                            {t('experimental_disclaimer')}
                          </div>
                        </>
                      ) : (
                        t('reveal_answer')
                      )}
                    </button>
                  </div>
                );
              }

              // If the message is a followup, we will render it as a button
              if (
                Array.isArray(children) &&
                children?.[0] === '@' &&
                children?.[1]?.startsWith('<')
              ) {
                // content will be all the text after the @<*> excluding the last child
                const content = children
                  ?.slice(2, -1)
                  ?.map((child) => child?.toString())
                  ?.join('')
                  ?.trim();

                if (embeddedUrl)
                  return (
                    <Link
                      className="font-semibold text-foreground bg-foreground/5 hover:bg-foreground/10 mb-2 inline-block rounded-full border text-left no-underline transition last:mb-0"
                      href={`${embeddedUrl}/${message?.chat_id}?input=${content}`}
                    >
                      <span className="line-clamp-1 px-3 py-1">
                        {content || '...'}
                      </span>
                    </Link>
                  );

                if (setInput)
                  return (
                    <button
                      className="font-semibold text-foreground bg-foreground/5 hover:bg-foreground/10 mb-2 rounded-full border text-left transition last:mb-0"
                      onClick={() => setInput(content || '')}
                    >
                      <span className="line-clamp-1 px-3 py-1">
                        {content || '...'}
                      </span>
                    </button>
                  );

                return (
                  <span className="text-foreground bg-foreground/5 mb-2 inline-block rounded-full border text-left transition last:mb-0">
                    <span className="line-clamp-1 px-3 py-1">
                      {content || '...'}
                    </span>
                  </span>
                );
              }

              return (
                <p className="text-foreground mb-2 last:mb-0">{children}</p>
              );
            },
            blockquote({ children }) {
              return (
                <blockquote className="border-foreground/30 text-foreground/80 border-l-4 pl-2">
                  {children}
                </blockquote>
              );
            },
            code({ node, className, children, ...props }) {
              if (children && Array.isArray(children) && children.length) {
                if (children[0] == '▍') {
                  return (
                    <span
                      className={cn(
                        'mt-1 animate-pulse cursor-default',
                        className
                      )}
                    >
                      ▍
                    </span>
                  );
                }

                children[0] = (children[0] as string).replace('`▍`', '▍');
              }

              const match = /language-(\w+)/.exec(className || '');

              return match ? (
                <CodeBlock
                  key={Math.random()}
                  language={(match && match[1]) || ''}
                  value={String(children).replace(/\n$/, '')}
                  {...props}
                />
              ) : (
                <code
                  className={cn('text-foreground font-semibold', className)}
                  {...props}
                >
                  {children}
                </code>
              );
            },
            table({ children }) {
              return (
                <table className="w-full overflow-x-scroll table-fixed">
                  {children}
                </table>
              );
            },
            th({ children }) {
              return <th className="text-foreground">{children}</th>;
            },
            pre({ children }) {
              return (
                <pre className="bg-foreground/5 rounded-lg border">
                  {children}
                </pre>
              );
            },
            hr() {
              return <hr className="border-border" />;
            },
          }}
        >
          {message.content}
        </MemoizedReactMarkdown>
      </div>
    </div>
  );
}

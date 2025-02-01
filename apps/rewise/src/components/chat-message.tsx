'use client';

// Inspired by Chatbot-UI and modified to fit the needs of this project
// @see https://github.com/mckaywrigley/chatbot-ui/blob/main/components/Chat/ChatMessage.tsx
import { ChatMessageActions } from '@/components/chat-message-actions';
import { MemoizedReactMarkdown } from '@/components/markdown';
import { capitalize, cn } from '@/lib/utils';
import { type Message } from '@repo/ai/types';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/ui/components/ui/avatar';
import { CodeBlock } from '@repo/ui/components/ui/codeblock';
import { IconUser } from '@repo/ui/components/ui/icons';
import { Separator } from '@repo/ui/components/ui/separator';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Bot, Send, Sparkle } from 'lucide-react';
import mermaid from 'mermaid';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

function MermaidRenderer({ content }: { content: string }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    mermaid.initialize({
      theme: 'default',
      startOnLoad: false,
      securityLevel: 'strict',
      themeVariables: {
        fontSize: '14px',
      },
      flowchart: {
        htmlLabels: true,
        curve: 'linear',
      },
    });

    const renderDiagram = async () => {
      try {
        // Clean and preprocess the content
        const cleanContent = content
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '  ')
          .trim();

        // First try to parse the diagram
        await mermaid.parse(cleanContent);

        // If parsing succeeds, render it
        const { svg } = await mermaid.render('mermaid-diagram', cleanContent);
        setSvgContent(svg);
        setError('');
      } catch (error) {
        console.error('Mermaid rendering error:', error);
        setError(
          error instanceof Error ? error.message : 'Failed to render diagram'
        );
        setSvgContent('');
      }
    };

    renderDiagram();
  }, [content]);

  if (error) {
    return (
      <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/10 p-4 text-sm text-dynamic-red">
        <p className="font-semibold">Failed to render diagram:</p>
        <pre className="mt-2 font-mono text-xs whitespace-pre-wrap">
          {error}
        </pre>
      </div>
    );
  }

  if (!svgContent) {
    return <div className="animate-pulse">Loading diagram...</div>;
  }

  return (
    <div
      ref={elementRef}
      className="overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}

export interface ChatMessageProps {
  message: Message & {
    metadata?: {
      response_types?: (
        | 'summary'
        | 'notes'
        | 'multi_choice_quiz'
        | 'paragraph_quiz'
        | 'flashcards'
      )[];
    };
    chat_id?: string;
    model?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    created_at?: string;
    user?: {
      id: string;
      display_name?: string;
      email?: string;
      avatar_url?: string;
    };
  };
  embeddedUrl?: string;
  locale?: string;
  anonymize?: boolean;
  // eslint-disable-next-line no-unused-vars
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

  const t = useTranslations('ai_chat');

  return (
    <div
      className={cn('group relative mb-4 grid h-fit w-full gap-2')}
      {...props}
    >
      <div className="flex h-fit flex-wrap justify-between gap-2">
        <div className="flex h-fit w-fit items-center space-x-2 rounded-lg select-none">
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-foreground/10 text-foreground shadow'
            )}
          >
            {message.role === 'user' ? (
              message.user?.avatar_url ? (
                <Avatar className="h-12 w-12 rounded-md border">
                  <AvatarImage
                    src={message.user.avatar_url}
                    alt={message.user.display_name || 'User'}
                  />
                  <AvatarFallback className="rounded-lg font-semibold">
                    {message.user.display_name?.[0]?.toUpperCase() || (
                      <IconUser className="h-5 w-5" />
                    )}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <IconUser className="h-5 w-5" />
              )
            ) : (
              <Avatar className="h-12 w-12 rounded-md border">
                <AvatarImage
                  src="/media/logos/mira-light.png"
                  className="dark:hidden"
                  alt="Mira"
                />
                <AvatarImage
                  src="/media/logos/mira-dark.png"
                  className="hidden dark:block"
                  alt="Mira"
                />
                <AvatarFallback className="rounded-lg font-semibold">
                  AI
                </AvatarFallback>
              </Avatar>
            )}
          </div>
          <div
            className={`flex flex-col ${
              message.role === 'user' ? '' : 'h-12 justify-between'
            }`}
          >
            <span className="line-clamp-1 h-fit overflow-hidden text-lg font-bold">
              {message.role === 'user'
                ? anonymize
                  ? t('anonymous')
                  : message.user?.display_name || t('you')
                : 'Mira'}
            </span>

            <div className="flex flex-wrap items-center gap-1 text-xs font-semibold">
              {message.model && (
                <span className="hidden items-center gap-1 rounded border border-dynamic-yellow/10 bg-dynamic-yellow/10 px-1 font-mono text-dynamic-yellow md:inline-flex">
                  <Sparkle className="h-3 w-3" />
                  {message.model}
                </span>
              )}
              {message.prompt_tokens !== undefined &&
                message.prompt_tokens !== 0 && (
                  <span className="inline-flex items-center gap-1 rounded border border-dynamic-green/10 bg-dynamic-green/10 px-1 font-mono text-dynamic-green">
                    <Send className="h-3 w-3" />
                    {Intl.NumberFormat(locale).format(message.prompt_tokens)}
                  </span>
                )}
              {message.completion_tokens !== undefined &&
                message.completion_tokens !== 0 && (
                  <span className="inline-flex items-center gap-1 rounded border border-dynamic-purple/10 bg-dynamic-purple/10 px-1 font-mono text-dynamic-purple">
                    <Bot className="h-3 w-3" />
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

      {message.metadata?.['response_types'] && (
        <div className="mb-2 flex items-center gap-1">
          {message.metadata?.['response_types']
            ?.filter((responseType) =>
              [
                'summary',
                'notes',
                'multi_choice_quiz',
                'paragraph_quiz',
                'flashcards',
              ].includes(responseType)
            )
            ?.map((responseType, index) => (
              <span
                key={index}
                className="inline-block rounded border border-foreground/20 bg-foreground/5 px-2 py-1 text-xs font-semibold text-foreground/80"
              >
                {t(responseType)}
              </span>
            ))}
        </div>
      )}

      <div className="flex-1 space-y-2">
        <MemoizedReactMarkdown
          className="prose w-[calc(100vw-8rem)] min-w-full break-words text-foreground md:w-[38rem] lg:w-full dark:prose-invert prose-p:leading-relaxed prose-p:before:hidden prose-p:after:hidden prose-code:before:hidden prose-code:after:hidden prose-pre:p-2 prose-li:marker:text-foreground/80 prose-tr:border-border prose-th:border prose-th:border-b-4 prose-th:border-foreground/20 prose-th:p-2 prose-th:text-center prose-th:text-lg prose-td:border prose-td:p-2"
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            h1({ children }) {
              return <h1 className="mt-6 mb-2 text-foreground">{children}</h1>;
            },
            h2({ children }) {
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
                    className={`w-full rounded border px-3 py-1 text-left font-semibold transition md:text-center ${
                      revealCorrect && option.isCorrect
                        ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green'
                        : revealCorrect
                          ? 'bg-foreground/5 text-foreground opacity-50'
                          : 'bg-foreground/5 text-foreground hover:bg-foreground/10'
                    }`}
                    onClick={() => handleOptionClick(option)}
                  >
                    {option.text}
                  </button>
                ));

                return (
                  <div className="mt-4 flex w-full flex-col items-center justify-center rounded-lg border bg-foreground/5 p-4">
                    {questionElement}
                    <Separator className="my-2" />
                    <div
                      className={`grid w-full gap-2 md:grid-cols-2 ${
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
                            <span className="font-semibold text-dynamic-green underline">
                              {t('correct')}
                            </span>
                          ) : (
                            <span className="font-semibold text-dynamic-red underline">
                              {t('incorrect')}
                            </span>
                          )}
                          <span className="opacity-70">.</span>
                        </div>

                        <Separator className="my-4" />
                        <div className="w-full rounded border border-dynamic-purple/20 bg-dynamic-purple/10 p-1 text-center text-sm font-semibold text-dynamic-purple">
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
                  <div className="mt-4 flex w-full flex-col items-center justify-center rounded-lg border bg-foreground/5 p-4">
                    <div className="text-lg font-bold text-foreground">
                      {question}
                    </div>
                    <Separator className="mt-2 mb-4" />
                    <button
                      className={`w-full rounded border px-3 py-1 text-center font-semibold text-foreground transition duration-300 ${
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
                          <div className="w-full rounded border border-dynamic-purple/20 bg-dynamic-purple/10 p-1 text-center text-sm text-dynamic-purple">
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
                      className="mb-2 inline-block rounded-full border bg-foreground/5 text-left font-semibold text-foreground no-underline transition last:mb-0 hover:bg-foreground/10"
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
                      className="mb-2 rounded-full border bg-foreground/5 text-left font-semibold text-foreground transition last:mb-0 hover:bg-foreground/10"
                      onClick={() => setInput(content || '')}
                    >
                      <span className="line-clamp-1 px-3 py-1">
                        {content || '...'}
                      </span>
                    </button>
                  );

                return (
                  <span className="mb-2 inline-block rounded-full border bg-foreground/5 text-left text-foreground transition last:mb-0">
                    <span className="line-clamp-1 px-3 py-1">
                      {content || '...'}
                    </span>
                  </span>
                );
              }

              return <h2 className="mt-6 mb-2 text-foreground">{children}</h2>;
            },
            h3({ children }) {
              return <h3 className="mt-6 mb-2 text-foreground">{children}</h3>;
            },
            h4({ children }) {
              return <h4 className="mt-6 mb-2 text-foreground">{children}</h4>;
            },
            h5({ children }) {
              return <h5 className="mt-6 mb-2 text-foreground">{children}</h5>;
            },
            h6({ children }) {
              return <h6 className="mt-6 mb-2 text-foreground">{children}</h6>;
            },
            strong({ children }) {
              return (
                <strong className="font-semibold text-foreground">
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
                    className={`w-full rounded border px-3 py-1 text-left font-semibold transition md:text-center ${
                      revealCorrect && option.isCorrect
                        ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green'
                        : revealCorrect
                          ? 'bg-foreground/5 text-foreground opacity-50'
                          : 'bg-foreground/5 text-foreground hover:bg-foreground/10'
                    }`}
                    onClick={() => handleOptionClick(option)}
                  >
                    {option.text}
                  </button>
                ));

                return (
                  <div className="mt-4 flex w-full flex-col items-center justify-center rounded-lg border bg-foreground/5 p-4">
                    {questionElement}
                    <Separator className="my-2" />
                    <div
                      className={`grid w-full gap-2 md:grid-cols-2 ${
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
                            <span className="font-semibold text-dynamic-green underline">
                              {t('correct')}
                            </span>
                          ) : (
                            <span className="font-semibold text-dynamic-red underline">
                              {t('incorrect')}
                            </span>
                          )}
                          <span className="opacity-70">.</span>
                        </div>

                        <Separator className="my-4" />
                        <div className="w-full rounded border border-dynamic-purple/20 bg-dynamic-purple/10 p-1 text-center text-sm font-semibold text-dynamic-purple">
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
                  <div className="mt-4 flex w-full flex-col items-center justify-center rounded-lg border bg-foreground/5 p-4">
                    <div className="text-lg font-bold text-foreground">
                      {question}
                    </div>
                    <Separator className="mt-2 mb-4" />
                    <button
                      className={`w-full rounded border px-3 py-1 text-center font-semibold text-foreground transition duration-300 ${
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
                          <div className="w-full rounded border border-dynamic-purple/20 bg-dynamic-purple/10 p-1 text-center text-sm text-dynamic-purple">
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
                      className="mb-2 inline-block rounded-full border bg-foreground/5 text-left font-semibold text-foreground no-underline transition last:mb-0 hover:bg-foreground/10"
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
                      className="mb-2 rounded-full border bg-foreground/5 text-left font-semibold text-foreground transition last:mb-0 hover:bg-foreground/10"
                      onClick={() => setInput(content || '')}
                    >
                      <span className="line-clamp-1 px-3 py-1">
                        {content || '...'}
                      </span>
                    </button>
                  );

                return (
                  <span className="mb-2 inline-block rounded-full border bg-foreground/5 text-left text-foreground transition last:mb-0">
                    <span className="line-clamp-1 px-3 py-1">
                      {content || '...'}
                    </span>
                  </span>
                );
              }

              return (
                <p className="mb-2 text-foreground last:mb-0">{children}</p>
              );
            },
            blockquote({ children }) {
              return (
                <blockquote className="border-l-4 border-foreground/30 pl-2 text-foreground/80">
                  {children}
                </blockquote>
              );
            },
            // eslint-disable-next-line no-unused-vars
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

              if (match && match[1] === 'mermaid') {
                return (
                  <div className="my-4">
                    <MermaidRenderer
                      content={String(children).replace(/\n$/, '')}
                    />
                  </div>
                );
              }

              return match ? (
                <CodeBlock
                  key={Math.random()}
                  language={(match && match[1]) || ''}
                  value={String(children).replace(/\n$/, '')}
                  {...props}
                />
              ) : (
                <code
                  className={cn('font-semibold text-foreground', className)}
                  {...props}
                >
                  {children}
                </code>
              );
            },
            table({ children }) {
              return (
                <table className="w-full table-fixed overflow-x-scroll">
                  {children}
                </table>
              );
            },
            th({ children }) {
              return <th className="text-foreground">{children}</th>;
            },
            pre({ children }) {
              return (
                <pre className="rounded-lg border bg-foreground/5">
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

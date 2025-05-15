'use client';

// Inspired by Chatbot-UI and modified to fit the needs of this project
// @see https://github.com/mckaywrigley/chatbot-ui/blob/main/components/Chat/ChatMessage.tsx
import { ChatMessageActions } from '@/components/chat-message-actions';
import { type Message } from '@tuturuuu/ai/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { CodeBlock } from '@tuturuuu/ui/codeblock';
import { Bot, IconUser, Send, Sparkle } from '@tuturuuu/ui/icons';
import { MemoizedReactMarkdown } from '@tuturuuu/ui/markdown';
import { Separator } from '@tuturuuu/ui/separator';
import { capitalize, cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relativeTime from 'dayjs/plugin/relativeTime';
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
      <div className="border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red rounded-lg border p-4 text-sm">
        <p className="font-semibold">Failed to render diagram:</p>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">
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
                  : t('you')
                : 'Mira'}
            </span>

            <div className="flex flex-wrap items-center gap-1 text-xs font-semibold">
              {message.model && (
                <span className="border-dynamic-yellow/10 bg-dynamic-yellow/10 text-dynamic-yellow hidden items-center gap-1 rounded border px-1 font-mono md:inline-flex">
                  <Sparkle className="h-3 w-3" />
                  {message.model}
                </span>
              )}
              {message.prompt_tokens !== undefined &&
                message.prompt_tokens !== 0 && (
                  <span className="border-dynamic-green/10 bg-dynamic-green/10 text-dynamic-green inline-flex items-center gap-1 rounded border px-1 font-mono">
                    <Send className="h-3 w-3" />
                    {Intl.NumberFormat(locale).format(message.prompt_tokens)}
                  </span>
                )}
              {message.completion_tokens !== undefined &&
                message.completion_tokens !== 0 && (
                  <span className="border-dynamic-purple/10 bg-dynamic-purple/10 text-dynamic-purple inline-flex items-center gap-1 rounded border px-1 font-mono">
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
              className="border-foreground/20 bg-foreground/5 text-foreground/80 inline-block rounded border px-2 py-1 text-xs font-semibold"
            >
              {t(responseType)}
            </span>
          ))}
      </div>

      <div
        className={cn(
          'flex-1 space-y-2',
          'prose text-foreground dark:prose-invert prose-p:leading-relaxed prose-p:before:hidden prose-p:after:hidden prose-code:before:hidden prose-code:after:hidden prose-pre:p-2 prose-li:marker:text-foreground/80 prose-tr:border-border prose-th:border prose-th:border-b-4 prose-th:border-foreground/20 prose-th:p-2 prose-th:text-center prose-th:text-lg prose-td:border prose-td:p-2 w-[calc(100vw-8rem)] min-w-full break-words md:w-152 lg:w-full'
        )}
      >
        <MemoizedReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            h1({ children }) {
              return <h1 className="text-foreground mb-2 mt-6">{children}</h1>;
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
                  <div className="text-foreground text-lg font-bold">
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
                  <div className="bg-foreground/5 mt-4 flex w-full flex-col items-center justify-center rounded-lg border p-4">
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
                            <span className="text-dynamic-green font-semibold underline">
                              {t('correct')}
                            </span>
                          ) : (
                            <span className="text-dynamic-red font-semibold underline">
                              {t('incorrect')}
                            </span>
                          )}
                          <span className="opacity-70">.</span>
                        </div>

                        <Separator className="my-4" />
                        <div className="border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple w-full rounded border p-1 text-center text-sm font-semibold">
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
                  <div className="bg-foreground/5 mt-4 flex w-full flex-col items-center justify-center rounded-lg border p-4">
                    <div className="text-foreground text-lg font-bold">
                      {question}
                    </div>
                    <Separator className="mb-4 mt-2" />
                    <button
                      className={`text-foreground w-full rounded border px-3 py-1 text-center font-semibold transition duration-300 ${
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
                          <div className="border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple w-full rounded border p-1 text-center text-sm">
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
                      className="bg-foreground/5 text-foreground hover:bg-foreground/10 mb-2 inline-block rounded-full border text-left font-semibold no-underline transition last:mb-0"
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
                      className="bg-foreground/5 text-foreground hover:bg-foreground/10 mb-2 rounded-full border text-left font-semibold transition last:mb-0"
                      onClick={() => setInput(content || '')}
                    >
                      <span className="line-clamp-1 px-3 py-1">
                        {content || '...'}
                      </span>
                    </button>
                  );

                return (
                  <span className="bg-foreground/5 text-foreground mb-2 inline-block rounded-full border text-left transition last:mb-0">
                    <span className="line-clamp-1 px-3 py-1">
                      {content || '...'}
                    </span>
                  </span>
                );
              }

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
                  <div className="text-foreground text-lg font-bold">
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
                  <div className="bg-foreground/5 mt-4 flex w-full flex-col items-center justify-center rounded-lg border p-4">
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
                            <span className="text-dynamic-green font-semibold underline">
                              {t('correct')}
                            </span>
                          ) : (
                            <span className="text-dynamic-red font-semibold underline">
                              {t('incorrect')}
                            </span>
                          )}
                          <span className="opacity-70">.</span>
                        </div>

                        <Separator className="my-4" />
                        <div className="border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple w-full rounded border p-1 text-center text-sm font-semibold">
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
                  <div className="bg-foreground/5 mt-4 flex w-full flex-col items-center justify-center rounded-lg border p-4">
                    <div className="text-foreground text-lg font-bold">
                      {question}
                    </div>
                    <Separator className="mb-4 mt-2" />
                    <button
                      className={`text-foreground w-full rounded border px-3 py-1 text-center font-semibold transition duration-300 ${
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
                          <div className="border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple w-full rounded border p-1 text-center text-sm">
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
                      className="bg-foreground/5 text-foreground hover:bg-foreground/10 mb-2 inline-block rounded-full border text-left font-semibold no-underline transition last:mb-0"
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
                      className="bg-foreground/5 text-foreground hover:bg-foreground/10 mb-2 rounded-full border text-left font-semibold transition last:mb-0"
                      onClick={() => setInput(content || '')}
                    >
                      <span className="line-clamp-1 px-3 py-1">
                        {content || '...'}
                      </span>
                    </button>
                  );

                return (
                  <span className="bg-foreground/5 text-foreground mb-2 inline-block rounded-full border text-left transition last:mb-0">
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
                  className={cn('text-foreground font-semibold', className)}
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

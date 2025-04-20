// Inspired by Chatbot-UI and modified to fit the needs of this project
// @see https://github.com/mckaywrigley/chatbot-ui/blob/main/components/Chat/ChatMessage.tsx
import { ChatMessageActions } from '@/components/chat-message-actions';
import { type Message } from '@tuturuuu/ai/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { CodeBlock } from '@tuturuuu/ui/codeblock';
import { IconUser } from '@tuturuuu/ui/icons';
import { MemoizedReactMarkdown } from '@tuturuuu/ui/markdown';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

export interface ChatMessageProps {
  message: Message & { chat_id?: string; created_at?: string };
  model?: string | null;
  // eslint-disable-next-line no-unused-vars
  setInput?: (input: string) => void;
}

export function FleetingAssistantMessage({
  message,
  model,
  setInput,
  ...props
}: ChatMessageProps) {
  dayjs.extend(relativeTime);

  const t = useTranslations('ai_chat');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme?.includes('dark');

  // const formattedModel = model?.replace(/_/g, ' ').replace(/-/g, ' ');
  const formattedModel = model;

  return (
    <div
      className={cn('group relative mb-4 grid h-fit w-full gap-4')}
      {...props}
    >
      <div className="flex h-fit flex-wrap gap-2">
        <div
          className={`${
            resolvedTheme === 'light'
              ? 'bg-transparent'
              : resolvedTheme === 'dark' || resolvedTheme?.startsWith('light')
                ? 'bg-foreground/5'
                : 'bg-foreground/10'
          } flex h-fit w-fit select-none items-center space-x-2 rounded-lg border p-2`}
        >
          <div
            className={cn(
              'bg-foreground/10 text-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-md border shadow'
            )}
          >
            {message.role === 'user' ? (
              <IconUser className="h-5 w-5" />
            ) : (
              <Avatar className="h-10 w-10 rounded-md border">
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
          <div>
            <span className="line-clamp-1 font-semibold">
              {message.role === 'user' ? (
                t('you')
              ) : (
                <span
                  className={`overflow-hidden bg-gradient-to-r bg-clip-text font-bold text-transparent ${
                    isDark
                      ? 'from-pink-300 via-amber-200 to-blue-300'
                      : 'from-pink-600 via-purple-500 to-sky-500'
                  }`}
                >
                  Mira AI {formattedModel ? `/ ${formattedModel}` : ''}
                </span>
              )}
            </span>
          </div>
        </div>

        <ChatMessageActions message={message} />
      </div>

      <div
        className={cn(
          'flex-1 space-y-2',
          'prose text-foreground dark:prose-invert prose-p:leading-relaxed prose-p:before:hidden prose-p:after:hidden prose-code:before:hidden prose-code:after:hidden prose-pre:p-2 prose-li:marker:text-foreground/80 prose-tr:border-border prose-th:border prose-th:border-b-4 prose-th:border-foreground/20 prose-th:p-2 prose-th:text-center prose-th:text-lg prose-td:border prose-td:p-2 w-[calc(100vw-8rem)] min-w-full break-words md:w-[38rem] lg:w-full'
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
            code({ className, children, ...props }) {
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

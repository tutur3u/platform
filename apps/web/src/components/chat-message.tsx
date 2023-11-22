// Inspired by Chatbot-UI and modified to fit the needs of this project
// @see https://github.com/mckaywrigley/chatbot-ui/blob/main/components/Chat/ChatMessage.tsx

import { Message } from 'ai';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/lib/utils';
import { CodeBlock } from '@/components/ui/codeblock';
import { MemoizedReactMarkdown } from '@/components/markdown';
import { IconUser } from '@/components/ui/icons';
import { ChatMessageActions } from '@/components/chat-message-actions';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import 'katex/dist/katex.min.css';
import Link from 'next/link';

export interface ChatMessageProps {
  message: Message & { chat_id?: string };
  setInput: (input: string) => void;
  embeddedUrl?: string;
}

export function ChatMessage({
  message,
  setInput,
  embeddedUrl,
  ...props
}: ChatMessageProps) {
  return (
    <div className={cn('group relative mb-4 flex items-start')} {...props}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md border shadow',
          message.role === 'user'
            ? 'bg-background'
            : 'bg-primary text-primary-foreground'
        )}
      >
        {message.role === 'user' ? (
          <IconUser />
        ) : (
          <Avatar>
            <AvatarImage src="/media/logos/light.png" alt="AI" />
            <AvatarFallback className="font-semibold">AI</AvatarFallback>
          </Avatar>
        )}
      </div>
      <div className="flex-1 space-y-2 overflow-hidden pl-4">
        <MemoizedReactMarkdown
          className="text-foreground prose prose-p:before:hidden prose-p:after:hidden prose-li:marker:text-foreground/80 prose-code:before:hidden prose-code:after:hidden prose-th:border-foreground/20 prose-th:border prose-th:text-center prose-th:text-lg prose-th:p-2 prose-td:p-2 prose-th:border-b-4 prose-td:border prose-tr:border-border dark:prose-invert prose-p:leading-relaxed prose-pre:p-2 w-full max-w-full break-words"
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            h1({ children }) {
              return <h1 className="text-foreground">{children}</h1>;
            },
            h2({ children }) {
              return <h2 className="text-foreground">{children}</h2>;
            },
            h3({ children }) {
              return <h3 className="text-foreground">{children}</h3>;
            },
            h4({ children }) {
              return <h4 className="text-foreground">{children}</h4>;
            },
            h5({ children }) {
              return <h5 className="text-foreground">{children}</h5>;
            },
            h6({ children }) {
              return <h6 className="text-foreground">{children}</h6>;
            },
            strong({ children }) {
              return (
                <strong className="text-foreground font-semibold">
                  {children}
                </strong>
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

                if (embeddedUrl)
                  return (
                    <Link
                      className="bg-foreground/5 hover:bg-foreground/10 mb-2 inline-block rounded-full border text-left no-underline transition last:mb-0"
                      href={`${embeddedUrl}/${message?.chat_id}?input=${content}`}
                    >
                      <span className="line-clamp-1 px-3 py-1">
                        {content || '...'}
                      </span>
                    </Link>
                  );

                return (
                  <button
                    className="bg-foreground/5 hover:bg-foreground/10 mb-2 rounded-full border text-left transition last:mb-0"
                    onClick={() => setInput(content || '')}
                  >
                    <span className="line-clamp-1 px-3 py-1">
                      {content || '...'}
                    </span>
                  </button>
                );
              }

              return <p className="mb-2 last:mb-0">{children}</p>;
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
          }}
        >
          {message.content}
        </MemoizedReactMarkdown>
        <ChatMessageActions message={message} />
      </div>
    </div>
  );
}

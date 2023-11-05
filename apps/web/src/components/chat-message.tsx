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

export interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message, ...props }: ChatMessageProps) {
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
          className="text-foreground prose prose-li:marker:text-foreground/80 prose-th:border-foreground/20 prose-th:border prose-th:text-center prose-th:text-lg prose-th:p-2 prose-td:p-2 prose-th:border-b-4 prose-td:border prose-tr:border-border dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 max-w-4xl break-words"
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
              return <p className="mb-2 last:mb-0">{children}</p>;
            },
            code({ node, className, children, ...props }) {
              if (children && Array.isArray(children) && children.length) {
                if (children[0] == '▍') {
                  return (
                    <span className="mt-1 animate-pulse cursor-default">▍</span>
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
                  className={cn(
                    'bg-foreground/10 mr-0.5 rounded p-1 text-blue-600 dark:text-blue-300',
                    className
                  )}
                  {...props}
                >
                  {children}
                </code>
              );
            },
            th({ children }) {
              return <th className="text-foreground">{children}</th>;
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

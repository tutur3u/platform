import { ChatMessage } from '@/components/chat-message';
import { Separator } from '@repo/ui/components/ui/separator';
import { type Message } from 'ai';

export interface ChatList {
  title?: string | null;
  titleLoading?: boolean;
  messages: (Message & {
    chat_id?: string;
    model?: string;
    created_at?: string;
  })[];
  embeddedUrl?: string;
  locale: string;
  model?: string;
  anonymize?: boolean;
  setInput: (input: string) => void;
}

export function ChatList({
  title,
  titleLoading,
  messages,
  embeddedUrl,
  locale,
  model,
  anonymize,
  setInput,
}: ChatList) {
  if (!messages.length) return null;
  const formattedModel = model
    ?.replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .toUpperCase();

  return (
    <div
      className={`relative ${
        embeddedUrl ? 'w-full' : 'mx-auto lg:max-w-4xl xl:max-w-6xl'
      }`}
    >
      {(title || titleLoading) && (
        <>
          <div
            className={`bg-foreground/5 rounded-lg border p-4 text-center text-2xl font-semibold ${
              titleLoading ? 'animate-pulse text-transparent' : ''
            }`}
          >
            {titleLoading ? '...' : title}

            {formattedModel && (
              <div className="bg-foreground/5 mt-4 rounded-lg p-2 text-lg">
                {formattedModel}
              </div>
            )}
          </div>
          <Separator className="my-4 md:mb-8" />
        </>
      )}

      {messages.map((message, index) => (
        <div key={index}>
          <ChatMessage
            message={{
              ...message,
              model:
                message.model || message.role === 'user' ? undefined : model,
              content: message.content.trim(),
            }}
            setInput={setInput}
            embeddedUrl={embeddedUrl}
            locale={locale}
            anonymize={anonymize}
          />
          {index < messages.length - 1 && (
            <Separator className="my-4 md:my-8" />
          )}
        </div>
      ))}
    </div>
  );
}

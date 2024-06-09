import { ChatMessage } from '@/components/chat-message';
import { Separator } from '@/components/ui/separator';
import { type Message } from 'ai';

export interface ChatList {
  title?: string;
  titleLoading?: boolean;
  messages: (Message & {
    chat_id?: string;
    model?: string;
    created_at?: string;
  })[];
  setInput: (input: string) => void;
  embeddedUrl?: string;
  locale: string;
  model?: string;
}

export function ChatList({
  title,
  titleLoading,
  messages,
  setInput,
  embeddedUrl,
  locale,
  model,
}: ChatList) {
  if (!messages.length) return null;
  const formattedModel = model?.replace(/_/g, ' ').replace(/-/g, ' ');

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
              <div className="bg-foreground/10 mt-4 rounded-lg p-2 text-lg">
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
            message={{ ...message, content: message.content.trim() }}
            setInput={setInput}
            embeddedUrl={embeddedUrl}
            locale={locale}
            model={
              message.model?.replace(/_/g, ' ').replace(/-/g, ' ') ||
              formattedModel
            }
          />
          {index < messages.length - 1 && (
            <Separator className="my-4 md:my-8" />
          )}
        </div>
      ))}
    </div>
  );
}

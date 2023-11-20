import { type Message } from 'ai';

import { Separator } from '@/components/ui/separator';
import { ChatMessage } from '@/components/chat-message';

export interface ChatList {
  title?: string;
  messages: Message[];
  setInput: (input: string) => void;
}

export function ChatList({ title, messages, setInput }: ChatList) {
  if (!messages.length) {
    return null;
  }

  return (
    <div className="relative mx-auto lg:max-w-4xl">
      <div className="bg-foreground/5 rounded-lg border p-4 text-center text-2xl font-semibold">
        {title}
      </div>
      <Separator className="my-4 md:mb-8" />

      {messages.map((message, index) => (
        <div key={index}>
          <ChatMessage message={message} setInput={setInput} />
          {index < messages.length - 1 && (
            <Separator className="my-4 md:my-8" />
          )}
        </div>
      ))}
    </div>
  );
}

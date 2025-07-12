'use client';

import { defaultModel, type Model } from '@tuturuuu/ai/models';
import type { UIMessage } from '@tuturuuu/ai/types';
import type { AIChat } from '@tuturuuu/types/db';
import type React from 'react';
import { useState } from 'react';
import ChatInstance from './chat-instance';

export interface ChatProps extends React.ComponentProps<'div'> {
  inputModel?: Model;
  defaultChat?: Partial<AIChat>;
  initialMessages?: UIMessage[];
  chats?: AIChat[];
  count?: number | null;
  locale: string;
  noEmptyPage?: boolean;
  disabled?: boolean;
}

export default function Chat({
  inputModel = defaultModel,
  defaultChat,
  initialMessages,
  chats,
  count,
  className,
  locale,
  noEmptyPage,
  disabled,
}: ChatProps) {
  const [chat, setChat] = useState<Partial<AIChat> | undefined>(defaultChat);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  return (
    <ChatInstance
      key={chat?.id || 'new-chat'}
      inputModel={inputModel}
      chat={chat}
      setChat={setChat}
      initialMessages={initialMessages}
      chats={chats}
      count={count}
      className={className}
      locale={locale}
      noEmptyPage={noEmptyPage}
      disabled={disabled}
      pendingPrompt={pendingPrompt}
      setPendingPrompt={setPendingPrompt}
    />
  );
}

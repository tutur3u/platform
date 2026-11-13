'use client';

import { ActionProvider, StateProvider } from '@json-render/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import { type ReactNode, type RefObject, useEffect } from 'react';
import { getAssistantActivityStatus } from './chat-message-list';
import ChatMessageList from './chat-message-list';
import type { MessageFileAttachment } from './file-preview-chips';

interface MiraChatConversationProps {
  liveResults?: ReactNode;
  actionHandlers: ReturnType<
    typeof import('@/components/json-render/dashboard-registry').handlers
  >;
  assistantName: string;
  generativeUIStore: ReturnType<
    typeof import('@/components/json-render/generative-ui-store').createGenerativeUIAdapter
  >;
  hasFileOnlyPending: boolean;
  isBusy: boolean;
  messageAttachments: Map<string, MessageFileAttachment[]>;
  messages: UIMessage[];
  onAutoSubmitMermaidFix: (prompt: string) => void;
  pendingDisplay: string | null;
  pendingPrompt: string | null;
  queuedText: string | null;
  dispatchPending?: UIMessage | null;
  onActivityVisible?: () => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  userAvatarUrl?: string | null;
  userName?: string;
}

export function MiraChatConversation({
  liveResults,
  actionHandlers,
  assistantName,
  generativeUIStore,
  hasFileOnlyPending,
  isBusy,
  messageAttachments,
  messages,
  onAutoSubmitMermaidFix,
  pendingDisplay,
  pendingPrompt,
  queuedText,
  dispatchPending,
  onActivityVisible,
  scrollContainerRef,
  userAvatarUrl,
  userName,
}: MiraChatConversationProps) {
  const optimistic =
    dispatchPending &&
    !messages.some((message) => message.id === dispatchPending.id)
      ? dispatchPending
      : null;
  const baseMessages = optimistic ? [...messages, optimistic] : messages;
  const renderedMessages =
    (pendingDisplay || hasFileOnlyPending) && baseMessages.length === 0
      ? [
          {
            id: 'pending',
            role: 'user' as const,
            parts: pendingDisplay
              ? [{ type: 'text' as const, text: pendingDisplay }]
              : [],
          },
        ]
      : queuedText
        ? [
            ...baseMessages,
            {
              id: 'queued',
              role: 'user' as const,
              parts: [{ type: 'text' as const, text: queuedText }],
            },
          ]
        : baseMessages;

  const activity =
    isBusy ||
    !!pendingPrompt ||
    !!queuedText ||
    !!dispatchPending ||
    hasFileOnlyPending;
  const activityStatus = getAssistantActivityStatus({
    isStreaming: activity,
    lastMessage: renderedMessages.at(-1),
  });
  useEffect(() => {
    if (activityStatus) onActivityVisible?.();
  }, [activityStatus, onActivityVisible]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <StateProvider store={generativeUIStore}>
        <ActionProvider handlers={actionHandlers}>
          <ChatMessageList
            footer={liveResults}
            reserveComposerSpace={false}
            messages={renderedMessages}
            isStreaming={activity}
            assistantName={assistantName}
            userName={userName}
            userAvatarUrl={userAvatarUrl}
            onAutoSubmitMermaidFix={onAutoSubmitMermaidFix}
            scrollContainerRef={scrollContainerRef}
            messageAttachments={messageAttachments}
          />
        </ActionProvider>
      </StateProvider>
    </div>
  );
}

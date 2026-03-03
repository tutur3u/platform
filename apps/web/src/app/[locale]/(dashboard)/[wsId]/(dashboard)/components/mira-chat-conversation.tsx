'use client';

import { ActionProvider, StateProvider } from '@json-render/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import type { RefObject } from 'react';
import ChatMessageList from './chat-message-list';
import type { MessageFileAttachment } from './file-preview-chips';

interface MiraChatConversationProps {
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
  optimisticPendingMessage: UIMessage | null;
  pendingDisplay: string | null;
  pendingPrompt: string | null;
  queuedText: string | null;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  toolbarVisibilityAnchorRef: RefObject<HTMLDivElement | null>;
  userAvatarUrl?: string | null;
  userName?: string;
}

export function MiraChatConversation({
  actionHandlers,
  assistantName,
  generativeUIStore,
  hasFileOnlyPending,
  isBusy,
  messageAttachments,
  messages,
  onAutoSubmitMermaidFix,
  optimisticPendingMessage,
  pendingDisplay,
  pendingPrompt,
  queuedText,
  scrollContainerRef,
  toolbarVisibilityAnchorRef,
  userAvatarUrl,
  userName,
}: MiraChatConversationProps) {
  const optimisticMessageMissing =
    optimisticPendingMessage &&
    !messages.some((message) => message.id === optimisticPendingMessage.id)
      ? optimisticPendingMessage
      : null;

  const insertOptimisticPendingMessage = (items: UIMessage[]) => {
    if (!optimisticMessageMissing) return items;

    let insertionIndex = items.length;
    while (
      insertionIndex > 0 &&
      items[insertionIndex - 1]?.role === 'assistant'
    ) {
      insertionIndex -= 1;
    }

    return [
      ...items.slice(0, insertionIndex),
      optimisticMessageMissing,
      ...items.slice(insertionIndex),
    ];
  };

  const renderedMessages =
    optimisticMessageMissing && messages.length === 0
      ? [optimisticMessageMissing]
      : (pendingDisplay || hasFileOnlyPending) && messages.length === 0
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
              ...insertOptimisticPendingMessage(messages),
              {
                id: 'queued',
                role: 'user' as const,
                parts: [{ type: 'text' as const, text: queuedText }],
              },
            ]
          : insertOptimisticPendingMessage(messages);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <StateProvider store={generativeUIStore}>
        <ActionProvider handlers={actionHandlers}>
          <ChatMessageList
            messages={renderedMessages}
            isStreaming={isBusy || !!pendingPrompt}
            assistantName={assistantName}
            userName={userName}
            userAvatarUrl={userAvatarUrl}
            onAutoSubmitMermaidFix={onAutoSubmitMermaidFix}
            scrollContainerRef={scrollContainerRef}
            toolbarVisibilityAnchorRef={toolbarVisibilityAnchorRef}
            messageAttachments={messageAttachments}
          />
        </ActionProvider>
      </StateProvider>
    </div>
  );
}

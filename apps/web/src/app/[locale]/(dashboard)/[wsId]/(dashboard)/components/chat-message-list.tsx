'use client';

import { Loader2, Sparkles, UserIcon } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { cn } from '@tuturuuu/utils/format';
import {
  buildMermaidAutoRepairPrompt,
  extractMermaidBlocks,
  isAutoMermaidRepairPrompt,
  simpleStableHash,
} from '@/app/[locale]/(dashboard)/[wsId]/(dashboard)/components/mermaid-auto-repair';
import 'katex/dist/katex.min.css';
import mermaidParser from 'mermaid';
import { useTranslations } from 'next-intl';
import { type MutableRefObject, useCallback, useEffect, useRef } from 'react';
import {
  getDisplayText,
  getErrorMessage,
  getMessageText,
  getRenderableMessageAttachments,
  hasTextContent,
  hasToolParts,
} from './chat-message-list/helpers';
import {
  AssistantMarkdown,
  ReasoningPart,
} from './chat-message-list/markdown-components';
import { resolveMessageRenderGroups } from './chat-message-list/resolve-message-render-groups';
import {
  CollapsibleToolSection,
  CopyButton,
  GroupedToolCallParts,
  isVisualToolDescriptor,
  SourcesPart,
  ToolCallPart,
} from './chat-message-list/tool-components';
import type { ChatMessageListProps } from './chat-message-list/types';
import { UserMessageContent } from './chat-message-list/user-message-components';

const MAX_AUTO_MERMAID_REPAIR_ATTEMPTS = 2;
let mermaidParserInitialized = false;

function ensureMermaidParserInitialized(): void {
  if (mermaidParserInitialized) return;
  mermaidParser.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'default',
  });
  mermaidParserInitialized = true;
}

export default function ChatMessageList({
  messages,
  isStreaming,
  assistantName,
  userName,
  userAvatarUrl,
  onAutoSubmitMermaidFix,
  scrollContainerRef,
  toolbarVisibilityAnchorRef,
  messageAttachments,
}: ChatMessageListProps) {
  const t = useTranslations('dashboard.mira_chat');

  const containerRef = useRef<HTMLDivElement>(null);

  const setScrollContainerRef = useCallback(
    (el: HTMLDivElement | null) => {
      (containerRef as MutableRefObject<HTMLDivElement | null>).current = el;
      if (scrollContainerRef) {
        (
          scrollContainerRef as MutableRefObject<HTMLDivElement | null>
        ).current = el;
      }
    },
    [scrollContainerRef]
  );

  // Auto-scroll to bottom only when a new message is added (e.g. user sends prompt)
  // using scrollTop instead of scrollIntoView to avoid stealing focus from the input.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages.length is intentional scroll trigger
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const attemptedMermaidRepairsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!onAutoSubmitMermaidFix) return;
    if (isStreaming) return;

    const lastAssistantWithMermaid = [...messages]
      .reverse()
      .find(
        (msg) =>
          msg.role === 'assistant' && getMessageText(msg).includes('```mermaid')
      );
    if (!lastAssistantWithMermaid) return;

    const fullText = getMessageText(lastAssistantWithMermaid);
    const mermaidBlocks = extractMermaidBlocks(fullText);
    if (mermaidBlocks.length === 0) return;

    let cancelled = false;

    const run = async () => {
      ensureMermaidParserInitialized();
      for (let i = 0; i < mermaidBlocks.length; i++) {
        const block = mermaidBlocks[i]!;
        const repairKey = `${lastAssistantWithMermaid.id}:${i}:${simpleStableHash(block)}`;
        if (attemptedMermaidRepairsRef.current.has(repairKey)) continue;
        if (
          attemptedMermaidRepairsRef.current.size >=
          MAX_AUTO_MERMAID_REPAIR_ATTEMPTS
        ) {
          break;
        }

        try {
          await mermaidParser.parse(block);
        } catch (error) {
          if (cancelled) return;
          attemptedMermaidRepairsRef.current.add(repairKey);
          onAutoSubmitMermaidFix(
            buildMermaidAutoRepairPrompt({
              parseError: getErrorMessage(error),
              originalDiagram: block,
            })
          );
          break;
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [messages, isStreaming, onAutoSubmitMermaidFix]);

  if (messages.length === 0) return null;

  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') return i;
    }
    return -1;
  })();

  return (
    <div
      ref={setScrollContainerRef}
      className={cn(
        'scrollbar-none flex min-w-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-1 py-3',
        scrollContainerRef && 'pb-[60vh]'
      )}
    >
      {messages.map((message, index) => {
        const isUser = message.role === 'user';
        const userAttachments = isUser
          ? getRenderableMessageAttachments(message, messageAttachments)
          : [];
        const hasText = hasTextContent(message);
        const displayText = isUser
          ? getDisplayText(message, isAutoMermaidRepairPrompt)
          : '';
        const hasDisplayText = isUser ? displayText.trim().length > 0 : hasText;
        const hasTools = !isUser && hasToolParts(message);
        const hasAttachments = isUser && userAttachments.length > 0;

        // Skip messages with no renderable content
        if (!hasDisplayText && !hasTools && !hasAttachments) return null;

        const isLastAssistant = index === lastAssistantIndex;

        // Check if previous visible message has the same role (for grouping)
        const prevMessage = messages[index - 1];
        const isContinuation = prevMessage?.role === message.role;

        const messageText = isUser ? displayText : getMessageText(message);

        return (
          <div
            key={message.id}
            className={cn(
              'group flex gap-2.5',
              isUser ? 'flex-row-reverse' : '',
              isContinuation ? 'mt-0.5' : 'mt-3 first:mt-0'
            )}
          >
            {/* Avatar — show for first message in a group, invisible spacer for continuations */}
            <div className="flex w-7 shrink-0 flex-col items-center">
              {!isContinuation ? (
                isUser && userAvatarUrl ? (
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={userAvatarUrl} alt={t('you')} />
                    <AvatarFallback className="bg-foreground/10 text-xs">
                      <UserIcon className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full',
                      isUser
                        ? 'bg-foreground/10'
                        : 'bg-dynamic-purple/15 text-dynamic-purple'
                    )}
                  >
                    {isUser ? (
                      <UserIcon className="h-3.5 w-3.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                  </div>
                )
              ) : (
                <div className="h-0 w-7" />
              )}
            </div>

            {/* Message content — min-w-0 so bubble can shrink and wrap inside chat area */}
            <div
              className={cn(
                'flex min-w-0 max-w-[85%] flex-col sm:max-w-[80%]',
                isUser ? 'items-end' : 'items-start'
              )}
            >
              {/* Name label — show for first message in a group */}
              {!isContinuation && (
                <span
                  className={cn(
                    'mb-1 px-1 font-medium text-[11px] text-muted-foreground',
                    isUser && 'text-right'
                  )}
                >
                  {isUser ? userName || t('you') : (assistantName ?? 'Mira')}
                </span>
              )}

              {/* Bubble + actions row */}
              <div
                className={cn(
                  'flex min-w-0 items-end gap-1',
                  isUser ? 'flex-row-reverse' : ''
                )}
              >
                <div
                  className={cn(
                    'wrap-break-word min-w-0 max-w-full overflow-hidden rounded-2xl px-3.5 py-2.5 text-sm',
                    isUser
                      ? 'bg-foreground text-background'
                      : 'bg-muted/50 text-foreground'
                  )}
                >
                  {isUser ? (
                    <UserMessageContent
                      displayText={displayText}
                      attachments={userAttachments}
                    />
                  ) : (
                    <div className="flex min-w-0 max-w-full flex-col gap-2 overflow-hidden *:min-w-0 *:max-w-full">
                      {(() => {
                        const descriptors = resolveMessageRenderGroups({
                          message,
                          isStreaming,
                          isLastAssistant,
                        });
                        const elements: React.ReactNode[] = [];
                        let genericToolBatch: Extract<
                          (typeof descriptors)[number],
                          { kind: 'tool' | 'tool-group' }
                        >[] = [];

                        const flushBatch = () => {
                          if (genericToolBatch.length === 0) return;
                          if (genericToolBatch.length === 1) {
                            const d = genericToolBatch[0]!;
                            elements.push(
                              d.kind === 'tool' ? (
                                <ToolCallPart
                                  key={d.key}
                                  part={d.part}
                                  renderUiFailure={d.renderUiFailure}
                                />
                              ) : (
                                <GroupedToolCallParts
                                  key={d.key}
                                  parts={d.parts}
                                  toolName={d.toolName}
                                />
                              )
                            );
                          } else {
                            elements.push(
                              <CollapsibleToolSection
                                key={`collapsible-${genericToolBatch[0]!.key}`}
                                descriptors={genericToolBatch}
                              />
                            );
                          }
                          genericToolBatch = [];
                        };

                        for (const descriptor of descriptors) {
                          if (descriptor.kind === 'reasoning') {
                            flushBatch();
                            elements.push(
                              <ReasoningPart
                                key={descriptor.key}
                                text={descriptor.text}
                                isAnimating={descriptor.isAnimating}
                              />
                            );
                          } else if (descriptor.kind === 'text') {
                            flushBatch();
                            elements.push(
                              <AssistantMarkdown
                                key={descriptor.key}
                                text={descriptor.text}
                                isAnimating={descriptor.isAnimating}
                              />
                            );
                          } else if (
                            descriptor.kind === 'tool' ||
                            descriptor.kind === 'tool-group'
                          ) {
                            if (isVisualToolDescriptor(descriptor)) {
                              flushBatch();
                              elements.push(
                                descriptor.kind === 'tool' ? (
                                  <ToolCallPart
                                    key={descriptor.key}
                                    part={descriptor.part}
                                    renderUiFailure={descriptor.renderUiFailure}
                                  />
                                ) : (
                                  <GroupedToolCallParts
                                    key={descriptor.key}
                                    parts={descriptor.parts}
                                    toolName={descriptor.toolName}
                                  />
                                )
                              );
                            } else {
                              genericToolBatch.push(descriptor);
                            }
                          } else if (descriptor.kind === 'sources') {
                            flushBatch();
                            elements.push(
                              <SourcesPart
                                key={descriptor.key}
                                parts={descriptor.parts}
                              />
                            );
                          }
                        }
                        flushBatch();
                        return elements;
                      })()}
                    </div>
                  )}
                </div>

                {/* Copy button — appears on hover (hide for file-only messages) */}
                {hasDisplayText && messageText.trim() && (
                  <CopyButton text={messageText} />
                )}
                {/* Copy raw JSON — appears on hover, for non-user messages only */}
                {!isUser && (
                  <CopyButton
                    text={JSON.stringify(message, null, 2)}
                    icon="json"
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Thinking indicator */}
      {isStreaming &&
        (() => {
          const lastMsg = messages[messages.length - 1];
          const showThinking =
            lastMsg?.role === 'user' ||
            (lastMsg?.role === 'assistant' && !hasTextContent(lastMsg));
          return showThinking ? (
            <div className="mt-3 flex gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-dynamic-purple/15 text-dynamic-purple">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="flex flex-col items-start">
                <span className="mb-1 px-1 font-medium text-[11px] text-muted-foreground">
                  {assistantName ?? 'Mira'}
                </span>
                <div className="flex items-center gap-2 rounded-2xl bg-muted/50 px-3.5 py-2.5 text-muted-foreground text-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('thinking')}
                </div>
              </div>
            </div>
          ) : null;
        })()}
      <div
        ref={toolbarVisibilityAnchorRef}
        aria-hidden="true"
        className="h-px w-full shrink-0"
      />
    </div>
  );
}

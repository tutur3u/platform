'use client';

import { ChatMessage } from '@/components/chat-message';
import { DefaultChatTransport } from '@tuturuuu/ai/core';
import { defaultModel } from '@tuturuuu/ai/models';
import { useChat } from '@tuturuuu/ai/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import { AlertTriangle, Bot, RefreshCw, Send, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { CommandDialog } from '@tuturuuu/ui/command';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { useParams, usePathname } from 'next/navigation';
import * as React from 'react';
import './command-palette.css';

const UUID_REGEX =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

// Function to extract workspace ID from pathname
function getWorkspaceFromPath(pathname: string): string | null {
  // Match pattern like /locale/wsId/... or /wsId/...
  const matches = pathname.match(new RegExp(`\\/(${UUID_REGEX.source})`));
  return matches?.[1] || null;
}

const SUGGESTIONS: string[] = [
  'Create a task for “Prepare Q3 report” due next Friday',
  'Summarize the latest updates in this workspace',
  'Start a 25-minute focus timer for Design Review',
  'Show me tasks assigned to me this week',
  'Draft a standup update from recent activity',
];

//

// Main Command Palette Component
type CommandPaletteProps = {
  open: boolean;
  // Preferred prop for open change function to satisfy lint rule
  setOpenAction?: React.Dispatch<React.SetStateAction<boolean>>;
};
type LegacyProps = {
  // Back-compat props some parents may still pass
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  action?: React.Dispatch<React.SetStateAction<boolean>>;
};

export function CommandPalette(props: CommandPaletteProps & LegacyProps) {
  const { open } = props;
  const setOpenAction = React.useCallback<
    React.Dispatch<React.SetStateAction<boolean>>
  >(
    (value) => {
      if (props.setOpenAction) return props.setOpenAction(value);
      if (props.setOpen) return props.setOpen(value);
      if (props.action) return props.action(value);
    },
    [props.setOpenAction, props.setOpen, props.action]
  );
  const [inputValue, setInputValue] = React.useState('');
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [errorBoundaryKey, setErrorBoundaryKey] = React.useState(0);
  // Persisted chat thread id per workspace for context grouping
  const [chatId, setChatId] = React.useState<string | undefined>(undefined);
  const [pendingPrompt, setPendingPrompt] = React.useState<string | null>(null);

  const params = useParams();
  const pathname = usePathname();
  const { wsId: urlWsId } = params;

  // Try multiple methods to get workspace ID
  const workspaceId = React.useMemo(() => {
    // Method 1: From URL params (if it's a valid workspace ID)
    if (
      urlWsId &&
      typeof urlWsId === 'string' &&
      urlWsId !== 'undefined' &&
      (urlWsId === ROOT_WORKSPACE_ID ||
        urlWsId.match(new RegExp(`^${UUID_REGEX.source}$`)))
    ) {
      return urlWsId;
    }

    // Method 2: Extract from pathname
    const pathWorkspaceId = getWorkspaceFromPath(pathname);
    if (pathWorkspaceId) {
      return pathWorkspaceId;
    }

    return null;
  }, [urlWsId, pathname]);

  // Load persisted chat id for this workspace when it becomes available
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `cmdk_chat_id:${workspaceId ?? 'root'}`;
    const existing = window.sessionStorage.getItem(key) || undefined;
    setChatId(existing || undefined);
  }, [workspaceId]);

  // Rewise chat integration (initialized early for stable refs)
  const providerSlug = (defaultModel?.provider || 'google')
    .toLowerCase()
    .replace(' ', '-');
  const apiEndpoint = `/api/ai/chat/${providerSlug}` as const;
  const {
    id: currentChatId,
    messages: aiMessages,
    sendMessage,
    status,
    stop,
  } = useChat({
    id: chatId,
    generateId: generateRandomUUID,
    transport: new DefaultChatTransport({
      api: apiEndpoint,
      credentials: 'include',
      body: {
        model: defaultModel?.value || 'gemini-2.5-flash-lite',
        wsId: workspaceId ?? ROOT_WORKSPACE_ID,
      },
    }),
    onError() {
      // keep palette quiet
    },
  });
  const isLoading = status === 'streaming';

  // Note: Do not overwrite server-issued chatId with hook-generated id.
  // chatId is the source of truth and is persisted by createChat() only.
  // Persist hook id if we don't have one yet (initial mount), to mirror chat.tsx
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (chatId) return;
    if (!currentChatId) return;
    try {
      const key = `cmdk_chat_id:${workspaceId ?? 'root'}`;
      window.sessionStorage.setItem(key, currentChatId);
    } catch {}
    setChatId(currentChatId);
  }, [currentChatId, chatId, workspaceId]);

  // Helper to create a new chat on the server before first send
  const createChat = React.useCallback(
    async (firstMessage: string, id: string) => {
      try {
        const res = await fetch(`${apiEndpoint}/new`, {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({
            // Use explicit id so client and server stay in sync
            id,
            model: defaultModel?.value || 'gemini-2.5-flash-lite',
            message: firstMessage,
          }),
        });
        if (!res.ok) return undefined;
        // Persist and set chat id only after server confirms creation
        try {
          const key = `cmdk_chat_id:${workspaceId ?? 'root'}`;
          window.sessionStorage.setItem(key, id);
        } catch {}
        setChatId(id);
        return id;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to create palette chat', e);
      }
      return undefined;
    },
    [apiEndpoint, workspaceId]
  );

  // Reset function for error boundary
  const resetErrorBoundary = React.useCallback(() => {
    setErrorBoundaryKey((prev) => prev + 1);
    setInputValue('');
    // Stop any ongoing stream
    try {
      stop?.();
    } catch {}
  }, [stop]);

  // Focus input shortly after open
  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Reset state when modal closes
  React.useEffect(() => {
    if (!open) {
      const timeout = setTimeout(() => {
        setInputValue('');
        try {
          stop?.();
        } catch {}
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [open, stop]);

  // Enhanced keyboard event handling
  const openRef = React.useRef(open);
  const inputValRef = React.useRef(inputValue);
  React.useEffect(() => {
    openRef.current = open;
  }, [open]);
  React.useEffect(() => {
    inputValRef.current = inputValue;
  }, [inputValue]);

  React.useEffect(() => {
    const down = (e: KeyboardEvent & { __ttr_cmdk_handled__?: boolean }) => {
      if (e.__ttr_cmdk_handled__) return;
      if (e.repeat) return;
      // Command+K to toggle
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        // Check if user is typing in an input field
        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement ||
          activeElement?.getAttribute('contenteditable') === 'true'
        ) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        e.__ttr_cmdk_handled__ = true;
        setOpenAction((currentOpen: boolean) => !currentOpen);
        return;
      }

      // Enhanced Escape key behavior - adapted to chat textarea
      if (e.key === 'Escape' && openRef.current) {
        e.preventDefault();
        e.stopPropagation();

        const isTextareaFocused =
          inputRef.current && document.activeElement === inputRef.current;

        // If input is focused and has value, clear it first
        if (isTextareaFocused && inputValRef.current.trim()) {
          setInputValue('');
          return;
        }

        // Close the modal otherwise
        setOpenAction(false);
        return;
      }
    };

    document.addEventListener('keydown', down, { capture: true });
    return () =>
      document.removeEventListener('keydown', down, { capture: true });
  }, [setOpenAction]);

  const handleSend = React.useCallback(
    async (content?: string) => {
      const text = (content ?? inputValue).trim();
      if (!text || isLoading) return;
      setInputValue('');
      if (!chatId) {
        // Use the hook-provided id so client & server agree
        const idToUse = currentChatId;
        if (!idToUse) return; // should not happen; wait for hook id
        setPendingPrompt(text);
        await createChat(text, idToUse);
        return;
      }
      await sendMessage({
        role: 'user',
        parts: [{ type: 'text', text }],
      });
    },
    [inputValue, isLoading, sendMessage, chatId, createChat, currentChatId]
  );

  // When we just created a chat and have a queued prompt, send it now
  React.useEffect(() => {
    if (!pendingPrompt || !chatId) return;
    // Ensure we send after hook consumes the new id
    const t = setTimeout(() => {
      sendMessage({
        role: 'user',
        parts: [{ type: 'text', text: pendingPrompt }],
      });
      setPendingPrompt(null);
    }, 0);
    return () => clearTimeout(t);
  }, [pendingPrompt, chatId, sendMessage]);

  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const lastMessageId = aiMessages.length
    ? aiMessages[aiMessages.length - 1]?.id
    : undefined;
  React.useEffect(() => {
    if (!lastMessageId) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [lastMessageId]);

  // Auto-resize textarea height
  const inputLength = inputValue.length;
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // Read inputLength so linter knows we depend on it
    if (inputLength === 0) {
      // Reset to single-row when cleared
      el.style.height = 'auto';
    }
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [inputLength]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpenAction}
      showCloseButton={false}
      contentClassName="sm:max-w-4xl w-[min(96vw,1024px)] backdrop-blur-sm"
      aria-label="Jarvis AI Assistant"
    >
      <CommandPaletteErrorBoundary
        key={errorBoundaryKey}
        onReset={resetErrorBoundary}
      >
        {/* Enhanced Jarvis-style chat UI */}
        <div className="flex h-[75vh] min-h-[600px] flex-col bg-gradient-to-b from-background/95 to-background">
          {/* Enhanced Header */}
          <div className="flex items-center justify-between border-b bg-muted/30 px-6 py-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Sparkles className="h-5 w-5 animate-pulse text-primary" />
                <div className="-inset-1 absolute rounded-full bg-primary/20 blur-sm" />
              </div>
              <div className="flex flex-col">
                <p className="font-semibold text-lg">Jarvis</p>
                <span className="text-muted-foreground text-xs leading-none">
                  {workspaceId
                    ? 'Your intelligent workspace assistant'
                    : 'AI Assistant (limited workspace context)'}
                </span>
              </div>
              {currentChatId && (
                <div className="ml-4 flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                  <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-[10px] text-primary">
                    Thread {currentChatId.slice(0, 8)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {workspaceId ? (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-800 text-xs dark:bg-green-900/30 dark:text-green-400">
                    {workspaceId === ROOT_WORKSPACE_ID
                      ? 'Root Workspace'
                      : `Workspace: ${workspaceId.slice(0, 8)}`}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 dark:bg-orange-900/30">
                  <AlertTriangle className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                  <span className="font-medium text-orange-800 text-xs dark:text-orange-400">
                    Limited Context
                  </span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Start a fresh thread by resetting id
                  try {
                    const key = `cmdk_chat_id:${workspaceId ?? 'root'}`;
                    window.sessionStorage.removeItem(key);
                  } catch {}
                  setChatId(undefined);
                  setPendingPrompt(null);
                }}
                className="h-8 gap-2 text-xs transition-all hover:scale-105"
                aria-label="Start a new chat conversation"
              >
                <RefreshCw className="h-3 w-3" />
                New Chat
              </Button>
            </div>
          </div>

          {/* Enhanced Messages Area */}
          <div className="flex-1 space-y-6 overflow-y-auto scroll-smooth px-6 py-6">
            {/* Loading indicator */}
            {isLoading && (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-3.5 w-3.5 animate-pulse text-primary" />
                  </div>
                  <div className="absolute inset-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                </div>
              </div>
            )}

            {aiMessages.map((m, index) => (
              <div
                key={m.id}
                className={`flex items-start gap-4 transition-all duration-300 ${
                  index === aiMessages.length - 1
                    ? 'slide-in-from-bottom-4 animate-in'
                    : ''
                }`}
              >
                <div className="w-full">
                  {(() => {
                    type ChatMsg = UIMessage & {
                      metadata?: {
                        response_types?: (
                          | 'summary'
                          | 'notes'
                          | 'multi_choice_quiz'
                          | 'paragraph_quiz'
                          | 'flashcards'
                        )[];
                      };
                      chat_id?: string;
                      model?: string;
                      prompt_tokens?: number;
                      completion_tokens?: number;
                      created_at?: string;
                    };
                    return (
                      <ChatMessage
                        message={m as ChatMsg}
                        setInput={(v) => setInputValue(v)}
                      />
                    );
                  })()}
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />

            {/* Enhanced Suggestions when chat is empty */}
            {aiMessages.length === 0 && !isLoading && (
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="mb-2 font-medium text-foreground">
                    Quick Actions
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Try these suggestions to get started with Jarvis
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {SUGGESTIONS.map((suggestion, index) => (
                    <button
                      key={suggestion}
                      onClick={() => handleSend(suggestion)}
                      type="button"
                      className={`group relative overflow-hidden rounded-xl border border-border/50 bg-linear-to-br from-muted/30 to-muted/10 p-4 text-left transition-all duration-200 hover:scale-[1.02] hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/50 active:scale-[0.98] ${
                        index % 2 === 0
                          ? 'slide-in-from-left-4 animate-in'
                          : 'slide-in-from-right-4 animate-in'
                      }`}
                      style={{ animationDelay: `${index * 100}ms` }}
                      aria-label={`Try suggestion: ${suggestion}`}
                    >
                      <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="relative flex items-start gap-3">
                        <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                          <Sparkles className="h-4 w-4 text-primary transition-all group-hover:scale-110" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground text-sm transition-colors group-hover:text-primary">
                            {suggestion}
                          </p>
                          <p className="mt-1 text-muted-foreground text-xs opacity-0 transition-opacity group-hover:opacity-100">
                            Click to try this action
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Enhanced Welcome message when no messages yet */}
            {open && aiMessages.length === 0 && !isLoading && (
              <div className="slide-in-from-bottom-4 flex animate-in items-start gap-4">
                <div className="relative mt-1">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/10 shadow-lg">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="-inset-1 absolute animate-pulse rounded-full bg-primary/10 blur-sm" />
                </div>
                <div className="max-w-[85%] space-y-3">
                  <div className="rounded-2xl bg-linear-to-br from-muted/80 to-muted/40 px-4 py-3 shadow-sm backdrop-blur-sm">
                    <p className="text-foreground text-sm leading-relaxed">
                      👋 <strong>Welcome to Jarvis!</strong>
                    </p>
                    <p className="mt-2 text-foreground/80 text-sm leading-relaxed">
                      I'm your intelligent workspace assistant. I can help you
                      create tasks, summarize updates, start timers, navigate
                      your workspace, and much more—all without any setup
                      required.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-linear-to-br from-blue-50/80 to-blue-100/40 px-4 py-3 shadow-sm backdrop-blur-sm dark:from-blue-950/40 dark:to-blue-900/20">
                    <p className="text-blue-800 text-sm leading-relaxed dark:text-blue-200">
                      💡 <strong>Pro tip:</strong> Try the suggestions below or
                      ask me anything about your workspace. I have full context
                      of your current environment!
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Enhanced Composer */}
          <div className="border-t bg-muted/20 p-4 backdrop-blur-sm">
            <div className="flex items-end gap-3">
              <div className="relative flex-1">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  rows={1}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={
                    isLoading
                      ? 'Jarvis is thinking...'
                      : 'Ask me to create, find, summarize, or help with anything...'
                  }
                  disabled={isLoading}
                  className={`max-h-40 w-full resize-none rounded-xl border bg-background/80 px-4 py-3 text-sm shadow-sm backdrop-blur-sm transition-all duration-200 placeholder:text-muted-foreground/60 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                    isLoading
                      ? 'cursor-not-allowed opacity-75'
                      : 'hover:border-primary/30'
                  }`}
                  aria-label="Chat with Jarvis"
                />
                <div className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-2 text-muted-foreground/60">
                  <div className="flex items-center gap-1">
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono text-[10px] text-muted-foreground">
                      ⏎
                    </kbd>
                    <span className="text-[10px]">send</span>
                  </div>
                  <div className="h-3 w-px bg-border" />
                  <div className="flex items-center gap-1">
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono text-[10px] text-muted-foreground">
                      ⇧⏎
                    </kbd>
                    <span className="text-[10px]">new line</span>
                  </div>
                </div>
                {isLoading && (
                  <div className="absolute right-16 bottom-3">
                    <div className="flex items-center gap-1">
                      <div
                        className="h-1 w-1 animate-bounce rounded-full bg-primary"
                        style={{ animationDelay: '0ms' }}
                      />
                      <div
                        className="h-1 w-1 animate-bounce rounded-full bg-primary"
                        style={{ animationDelay: '150ms' }}
                      />
                      <div
                        className="h-1 w-1 animate-bounce rounded-full bg-primary"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <Button
                size="lg"
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isLoading}
                className={`h-12 gap-2 px-6 font-medium transition-all duration-200 ${
                  inputValue.trim() && !isLoading
                    ? 'shadow-lg hover:scale-105 hover:shadow-primary/20 hover:shadow-xl active:scale-95'
                    : ''
                }`}
                aria-label={isLoading ? 'Sending message...' : 'Send message'}
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {isLoading ? 'Sending...' : 'Send'}
              </Button>
            </div>
            {/* Character count and helpful tips */}
            <div className="mt-3 flex items-center justify-between text-muted-foreground text-xs">
              <div className="flex items-center gap-4">
                <span>{inputValue.length} characters</span>
                {inputValue.length > 1000 && (
                  <span className="text-orange-600">
                    Consider shorter messages for better responses
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <kbd className="rounded bg-muted px-1 py-0.5 text-[10px]">
                    ⌘K
                  </kbd>
                  <span>to close</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </CommandPaletteErrorBoundary>
    </CommandDialog>
  );
}

// Error boundary component for command palette
class CommandPaletteErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset: () => void },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode; onReset: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Command Palette Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-6 p-8 text-center">
          <div className="relative">
            <div className="rounded-full bg-red-100 p-6 dark:bg-red-900/20">
              <AlertTriangle className="h-12 w-12 text-red-600 dark:text-red-400" />
            </div>
            <div className="-inset-2 absolute animate-pulse rounded-full bg-red-500/10 blur-xl" />
          </div>
          <div className="max-w-md space-y-3">
            <h3 className="font-semibold text-foreground text-xl">
              Oops! Something went wrong
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Jarvis encountered an unexpected error while processing your
              request. This is usually temporary and can be resolved by trying
              again.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-muted-foreground text-sm transition-colors hover:text-foreground">
                  🔍 Technical details (development mode)
                </summary>
                <div className="mt-3 rounded-lg bg-red-50 p-4 dark:bg-red-950/20">
                  <pre className="whitespace-pre-wrap font-mono text-red-700 text-xs dark:text-red-300">
                    {this.state.error.message}
                    {this.state.error.stack && (
                      <>
                        {'\n\n'}
                        {this.state.error.stack}
                      </>
                    )}
                  </pre>
                </div>
              </details>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              onClick={() => {
                this.setState({ hasError: false, error: undefined });
                this.props.onReset();
              }}
              className="gap-2 font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => window.location.reload()}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Reload Page
            </Button>
          </div>
          <div className="mt-4 rounded-lg bg-muted/50 p-4 text-muted-foreground text-sm">
            <p className="flex items-center gap-2">
              <span>💡</span>
              <span>
                If this keeps happening, try refreshing the page or contact
                support
              </span>
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useChat } from '@tuturuuu/ai/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { handlers as jsonRenderHandlers } from '@/components/json-render/dashboard-registry';
import {
  type CreateTransactionInput,
  useCreateTransaction,
} from '@/components/json-render/dashboard-registry/shared';
import {
  createGenerativeUIAdapter,
  useGenerativeUIStore,
} from '@/components/json-render/generative-ui-store';
import { MiraChatBottomBar } from './mira-chat-bottom-bar';
import { getGreetingKey, STORAGE_KEY_PREFIX } from './mira-chat-constants';
import { MiraChatConversation } from './mira-chat-conversation';
import { MiraChatEmptyState } from './mira-chat-empty-state';
import { MiraChatHeader } from './mira-chat-header';
import { MiraVoiceModeSwitcher } from './mira-voice-mode-switcher';
import { useMiraChatActions } from './use-mira-chat-actions';
import { useMiraChatAttachments } from './use-mira-chat-attachments';
import type { MiraTaskBoardContext } from './use-mira-chat-config';
import { useMiraChatConfig } from './use-mira-chat-config';
import { useMiraChatEffects } from './use-mira-chat-effects';
import { useMiraChatHotkeys } from './use-mira-chat-hotkeys';
import { useMiraChatPersistence } from './use-mira-chat-persistence';
import { useMiraLiveConversation } from './use-mira-live-conversation';
import { useMiraMessageQueue } from './use-mira-message-queue';
import { useMiraUiActions } from './use-mira-ui-actions';

export interface MiraChatPanelProps {
  wsId: string;
  taskBoardId?: string;
  autoFocusSignal?: number;
  assistantName: string;
  userName?: string;
  userAvatarUrl?: string | null;
  workspaceContextBadge?: ReactNode;
  taskBoardContext?: MiraTaskBoardContext;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onResetPanelState?: () => void;
}

export default function MiraChatPanel({
  wsId,
  taskBoardId,
  autoFocusSignal = 0,
  assistantName,
  userName,
  userAvatarUrl,
  workspaceContextBadge,
  taskBoardContext,
  isFullscreen,
  onToggleFullscreen,
  onResetPanelState,
}: MiraChatPanelProps) {
  const t = useTranslations('dashboard.mira_chat');
  const greetingT = useTranslations('dashboard.greeting');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [viewOnly, setViewOnly] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const toolbarContentRef = useRef<HTMLDivElement>(null);
  const greetingKey = useMemo(() => getGreetingKey(), []);
  const generativeUIStore = useMemo(() => createGenerativeUIAdapter(), []);

  useEffect(() => {
    if (autoFocusSignal === 0) return;

    const focusInput = () => {
      inputRef.current?.focus({ preventScroll: true });
    };
    const animationFrame = window.requestAnimationFrame(focusInput);
    const timer = window.setTimeout(focusInput, 180);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timer);
    };
  }, [autoFocusSignal]);

  const createTransactionMutation = useCreateTransaction();
  const createTransactionRef = useRef<
    ((params: CreateTransactionInput) => Promise<void>) | null
  >(null);
  createTransactionRef.current = async (params) => {
    await createTransactionMutation.mutateAsync(params);
  };

  const sendMessageRef = useRef<
    ((message: UIMessage) => void | Promise<boolean> | Promise<void>) | null
  >(null);
  const submitTextRef = useRef<((value: string) => void) | null>(null);

  const actionHandlers = useMemo(
    () =>
      jsonRenderHandlers(
        () => (updater: any) => {
          const prev = useGenerativeUIStore.getState().ui;
          if (typeof updater === 'function') {
            useGenerativeUIStore.setState({ ui: updater(prev) });
          } else if (updater && typeof updater === 'object') {
            useGenerativeUIStore.setState({ ui: { ...prev, ...updater } });
          }
        },
        () => ({
          ...useGenerativeUIStore.getState().ui,
          createTransaction: createTransactionRef.current,
          sendMessage: sendMessageRef.current,
          submitText: submitTextRef.current,
        })
      ),
    []
  );

  const {
    activeCreditSource,
    chatRequestBody,
    creditWsId,
    gatewayModelId,
    isPersonalDashboardWorkspace,
    model,
    personalWorkspaceId,
    setCreditSource,
    setModel,
    supportsFileInput,
    thinkingMode,
    setThinkingMode,
    setWorkspaceContextId,
    transport,
    workspaceCreditLocked,
  } = useMiraChatConfig({ wsId, taskBoardContext });

  const {
    attachedFiles,
    clearAttachedFiles,
    cleanupPendingUploads,
    handleFileRemove,
    handleFilesSelected,
    messageAttachments,
    messageAttachmentsRef,
    setMessageAttachments,
    snapshotAttachmentsForMessage,
  } = useMiraChatAttachments({
    wsId,
    deleteFileFailedMessage: t('delete_file_failed'),
  });

  const {
    chat,
    fallbackChatId,
    initialMessages,
    isRestoring,
    pendingPrompt,
    setChat,
    setFallbackChatId,
    setPendingPrompt,
    setStoredChatId,
  } = useMiraChatPersistence({
    wsId,
    setMessageAttachments,
  });

  // When restoring a chat from DB, sync the model to match what was used
  useEffect(() => {
    if (!chat?.model) return;
    // chat.model may be a gateway ID like "google/gemini-2.5-flash"
    // or a bare name like "gemini-2.5-flash"
    const gatewayId = chat.model.includes('/')
      ? chat.model
      : `google/${chat.model}`;
    const provider = gatewayId.split('/')[0] ?? 'google';
    const bareName = gatewayId.split('/').slice(1).join('/');
    setModel({
      value: gatewayId,
      label: bareName,
      provider,
    });
  }, [chat?.model, setModel]);

  const stableChatId = chat?.id ?? fallbackChatId;

  const {
    id: chatId,
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
  } = useChat({
    id: stableChatId,
    generateId: () => crypto.randomUUID(),
    messages: initialMessages,
    transport,
    onError(error) {
      console.error('[Mira Chat] Stream error:', error);
      toast.error(t('stream_error'));
    },
  });

  const { onChange: onLiveConversationChange, flush: flushLiveConversation } =
    useMiraLiveConversation({
      chatId: stableChatId,
      setMessages,
      onStarted: (id) =>
        setChat((current) => current ?? { id, is_public: false }),
      onSaved: (id) => {
        setChat((current) => current ?? { id, is_public: false });
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${wsId}`, id);
      },
    });

  useMiraUiActions(messages, status);

  const sendMessageWithCurrentConfig = useCallback(
    async (message: UIMessage) => {
      try {
        await flushLiveConversation();
      } catch {
        const unsent = message.parts
          .flatMap((part) => (part.type === 'text' ? [part.text] : []))
          .join('\n');
        setInput((current) => [unsent, current].filter(Boolean).join('\n'));
        return false;
      }
      await sendMessage(message, { body: chatRequestBody });
      return true;
    },
    [chatRequestBody, sendMessage, flushLiveConversation]
  );
  sendMessageRef.current = sendMessageWithCurrentConfig;

  const handleModelChange = useCallback(
    (nextModel: typeof model) => {
      if (
        nextModel.value === model.value &&
        nextModel.provider === model.provider
      ) {
        return;
      }
      setModel(nextModel);
      if (status === 'submitted' || status === 'streaming') stop();
    },
    [model, setModel, status, stop]
  );

  const handleThinkingModeChange = useCallback(
    (nextMode: typeof thinkingMode) => {
      if (nextMode === thinkingMode) return;
      setThinkingMode(nextMode);
      if (status === 'submitted' || status === 'streaming') stop();
    },
    [setThinkingMode, status, stop, thinkingMode]
  );

  const handleCreditSourceChange = useCallback(
    (nextSource: typeof activeCreditSource) => {
      if (nextSource === activeCreditSource) return;
      if (nextSource === 'workspace' && workspaceCreditLocked) return;
      setCreditSource(nextSource);
      if (status === 'submitted' || status === 'streaming') stop();
    },
    [activeCreditSource, setCreditSource, status, stop, workspaceCreditLocked]
  );

  const handleCreditSourceToggle = useCallback(() => {
    if (workspaceCreditLocked) return;
    handleCreditSourceChange(
      activeCreditSource === 'personal' ? 'workspace' : 'personal'
    );
  }, [activeCreditSource, handleCreditSourceChange, workspaceCreditLocked]);

  const { createChat, handleExportChat, resetConversationState } =
    useMiraChatActions({
      chat,
      chatId,
      clearAttachedFiles,
      cleanupPendingUploads,
      fallbackChatId,
      gatewayModelId,
      messageAttachments,
      messages,
      model,
      sendMessageWithCurrentConfig,
      setChat,
      setFallbackChatId,
      setInput,
      setMessageAttachments,
      setPendingPrompt,
      setStoredChatId,
      setWorkspaceContextId,
      stableChatId,
      status,
      t,
      thinkingMode,
      wsId,
    });

  const { handleSubmit, queuedText, resetQueue } = useMiraMessageQueue({
    attachedFiles,
    chatId: chat?.id,
    clearAttachedFiles,
    createChat,
    sendMessageWithCurrentConfig,
    snapshotAttachmentsForMessage,
    status,
    stop,
  });
  submitTextRef.current = handleSubmit;

  const pendingDisplay = queuedText ?? pendingPrompt;
  const hasFileOnlyPending =
    !pendingDisplay && messageAttachments.size > 0 && messages.length === 0;
  const hasMessages =
    messages.length > 0 || !!pendingDisplay || hasFileOnlyPending;
  const isStreaming = status === 'streaming';
  const isBusy = status === 'submitted' || isStreaming;

  useMiraChatEffects({
    isFullscreen,
    messageAttachmentsRef,
    messages,
    onToggleFullscreen,
    queryClient,
    routerRefresh: router.refresh,
    setMessageAttachments,
    setWorkspaceContextId,
    status,
    taskBoardId,
    wsId,
  });

  useEffect(() => {
    if (!hasMessages) {
      setViewOnly(false);
    }
  }, [hasMessages]);

  const handleNewConversation = useCallback(() => {
    if (status === 'submitted' || status === 'streaming') {
      stop();
    }
    resetQueue();
    void resetConversationState();
    setCreditSource('personal');
    onResetPanelState?.();
  }, [
    onResetPanelState,
    resetConversationState,
    resetQueue,
    setCreditSource,
    status,
    stop,
  ]);

  const { hotkeyLabels, modelPickerHotkeySignal } = useMiraChatHotkeys({
    hasMessages,
    onCreditSourceToggle: workspaceCreditLocked
      ? undefined
      : handleCreditSourceToggle,
    onExportChat: handleExportChat,
    onNewConversation: handleNewConversation,
    onThinkingModeChange: handleThinkingModeChange,
    onToggleFullscreen,
    onToggleViewOnly: () => setViewOnly((value) => !value),
  });

  const dataWorkspaceId =
    chatRequestBody.workspaceContextId === 'personal'
      ? (personalWorkspaceId ?? 'personal')
      : chatRequestBody.workspaceContextId;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <MiraVoiceModeSwitcher
        key={stableChatId}
        historyReady={!isRestoring}
        history={messages}
        onConversationChange={onLiveConversationChange}
        onBeforeVoiceStart={stop}
        composerRef={composerRef}
        creditSource={activeCreditSource}
        creditWsId={creditWsId}
        header={(modeControl) => (
          <MiraChatHeader
            hasMessages={hasMessages}
            hotkeyLabels={hotkeyLabels}
            isFullscreen={isFullscreen}
            modeControl={modeControl}
            onExportChat={handleExportChat}
            onNewConversation={handleNewConversation}
            onToggleFullscreen={onToggleFullscreen}
            onToggleViewOnly={() => setViewOnly((value) => !value)}
            t={t}
            viewOnly={viewOnly}
            workspaceContextBadge={workspaceContextBadge}
          />
        )}
        inputRef={inputRef}
        wsId={dataWorkspaceId}
      >
        {(onVoiceToggle, voiceActive, live) => (
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {hasMessages ? (
              <MiraChatConversation
                liveResults={live.results}
                actionHandlers={actionHandlers}
                assistantName={assistantName}
                generativeUIStore={generativeUIStore}
                hasFileOnlyPending={hasFileOnlyPending}
                isBusy={isBusy}
                messageAttachments={messageAttachments}
                messages={messages}
                onAutoSubmitMermaidFix={handleSubmit}
                pendingDisplay={pendingDisplay}
                pendingPrompt={pendingPrompt}
                queuedText={queuedText}
                scrollContainerRef={scrollContainerRef}
                userAvatarUrl={userAvatarUrl}
                userName={userName}
              />
            ) : (
              <MiraChatEmptyState
                assistantName={assistantName}
                greetingKey={greetingKey}
                greetingT={greetingT}
                onQuickAction={handleSubmit}
                t={t}
                userName={userName}
              />
            )}

            <MiraChatBottomBar
              liveControls={live.content}
              liveInputOpen={live.inputOpen}
              composerRef={composerRef}
              assistantName={assistantName}
              attachedFiles={attachedFiles}
              bottomBarVisible={!viewOnly}
              floating={hasMessages}
              scrollContainerRef={scrollContainerRef}
              canUploadFiles={supportsFileInput && !voiceActive}
              input={input}
              inputRef={inputRef}
              isBusy={isBusy}
              disabled={
                voiceActive && (!live.composer || live.composer.connecting)
              }
              onFileRemove={handleFileRemove}
              onFilesSelected={
                supportsFileInput && !voiceActive
                  ? handleFilesSelected
                  : undefined
              }
              onSubmit={
                voiceActive && live.composer?.connected
                  ? (text) => {
                      if (live.composer?.connected) {
                        live.composer.sendText(text);
                        setInput('');
                      }
                    }
                  : handleSubmit
              }
              onVoiceToggle={onVoiceToggle}
              voiceActive={voiceActive}
              setInput={setInput}
              // Toolbar props
              activeCreditSource={activeCreditSource}
              creditWsId={creditWsId}
              hotkeyLabels={hotkeyLabels}
              isPersonalWorkspace={isPersonalDashboardWorkspace}
              model={model}
              modelPickerHotkeySignal={modelPickerHotkeySignal}
              onCreditSourceChange={handleCreditSourceChange}
              onModelChange={handleModelChange}
              onThinkingModeChange={handleThinkingModeChange}
              personalWsId={personalWorkspaceId ?? undefined}
              thinkingMode={thinkingMode}
              toolbarContentRef={toolbarContentRef}
              workspaceCreditLocked={workspaceCreditLocked}
              wsId={wsId}
            />
          </div>
        )}
      </MiraVoiceModeSwitcher>
    </div>
  );
}

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
import { getGreetingKey } from './mira-chat-constants';
import { MiraChatConversation } from './mira-chat-conversation';
import { MiraChatEmptyState } from './mira-chat-empty-state';
import { MiraChatHeader } from './mira-chat-header';
import { useMiraBottomBarVisibility } from './use-mira-bottom-bar-visibility';
import { useMiraChatActions } from './use-mira-chat-actions';
import { useMiraChatAttachments } from './use-mira-chat-attachments';
import { useMiraChatConfig } from './use-mira-chat-config';
import { useMiraChatEffects } from './use-mira-chat-effects';
import { useMiraChatHotkeys } from './use-mira-chat-hotkeys';
import { useMiraChatPersistence } from './use-mira-chat-persistence';
import { useMiraMessageQueue } from './use-mira-message-queue';

interface MiraChatPanelProps {
  wsId: string;
  assistantName: string;
  userName?: string;
  userAvatarUrl?: string | null;
  insightsDock?: ReactNode;
  workspaceContextBadge?: ReactNode;
  onVoiceToggle?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onResetPanelState?: () => void;
}

export default function MiraChatPanel({
  wsId,
  assistantName,
  userName,
  userAvatarUrl,
  insightsDock,
  workspaceContextBadge,
  onVoiceToggle,
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const toolbarContentRef = useRef<HTMLDivElement>(null);
  const toolbarVisibilityAnchorRef = useRef<HTMLDivElement>(null);
  const greetingKey = useMemo(() => getGreetingKey(), []);
  const generativeUIStore = useMemo(() => createGenerativeUIAdapter(), []);

  const createTransactionMutation = useCreateTransaction();
  const createTransactionRef = useRef<
    ((params: CreateTransactionInput) => Promise<void>) | null
  >(null);
  createTransactionRef.current = async (params) => {
    await createTransactionMutation.mutateAsync(params);
  };

  const sendMessageRef = useRef<
    ((message: UIMessage) => void | Promise<void>) | null
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
  } = useMiraChatConfig({ wsId });

  const {
    attachedFiles,
    attachedFilesRef,
    clearAttachedFiles,
    cleanupPendingUploads,
    getUploadedAttachmentMetadata,
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

  const sendMessageWithCurrentConfig = useCallback(
    (message: UIMessage) =>
      sendMessage(message, {
        body: chatRequestBody,
      }),
    [chatRequestBody, sendMessage]
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

  const { handleSubmit, optimisticPendingMessage, queuedText, resetQueue } =
    useMiraMessageQueue({
      attachedFilesRef,
      chatId: chat?.id,
      clearAttachedFiles,
      createChat,
      getUploadedAttachmentMetadata,
      messages,
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
    wsId,
  });

  const { bottomBarVisible } = useMiraBottomBarVisibility({
    auxiliaryToolbarRef: toolbarContentRef,
    hasMessages,
    scrollContainerRef,
    toolbarVisibilityAnchorRef,
    viewOnly,
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

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <MiraChatHeader
        hasMessages={hasMessages}
        hotkeyLabels={hotkeyLabels}
        insightsDock={insightsDock}
        isFullscreen={isFullscreen}
        onExportChat={handleExportChat}
        onNewConversation={handleNewConversation}
        onToggleFullscreen={onToggleFullscreen}
        onToggleViewOnly={() => setViewOnly((value) => !value)}
        t={t}
        viewOnly={viewOnly}
        workspaceContextBadge={workspaceContextBadge}
      />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {hasMessages ? (
          <MiraChatConversation
            actionHandlers={actionHandlers}
            assistantName={assistantName}
            generativeUIStore={generativeUIStore}
            hasFileOnlyPending={hasFileOnlyPending}
            isBusy={isBusy}
            messageAttachments={messageAttachments}
            messages={messages}
            onAutoSubmitMermaidFix={handleSubmit}
            optimisticPendingMessage={optimisticPendingMessage}
            pendingDisplay={pendingDisplay}
            pendingPrompt={pendingPrompt}
            queuedText={queuedText}
            scrollContainerRef={scrollContainerRef}
            toolbarVisibilityAnchorRef={toolbarVisibilityAnchorRef}
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
          assistantName={assistantName}
          attachedFiles={attachedFiles}
          bottomBarVisible={bottomBarVisible}
          canUploadFiles={supportsFileInput}
          input={input}
          inputRef={inputRef}
          isBusy={isBusy}
          onFileRemove={handleFileRemove}
          onFilesSelected={supportsFileInput ? handleFilesSelected : undefined}
          onSubmit={handleSubmit}
          onVoiceToggle={onVoiceToggle}
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
    </div>
  );
}

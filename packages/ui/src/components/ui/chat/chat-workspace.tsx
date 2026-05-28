"use client";

import type {
  ChatAttachment,
  ChatAttachmentDraft,
  ChatConversation,
} from "@tuturuuu/internal-api";
import { cn } from "@tuturuuu/utils/format";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../badge";
import { toast } from "../sonner";
import { ChatSidebar } from "./chat-sidebar";
import { ChatHeader, EmptyConversationState } from "./chat-workspace-header";
import { CreateConversationDialog } from "./create-conversation-dialog";
import {
  useChatConversations,
  useDeleteChatConversation,
  useChatMessageSearch,
  useChatMessages,
  useMarkChatConversationRead,
  useOpenChatAttachment,
  useSendChatMessage,
  useToggleChatReaction,
  useUpdateChatConversation,
  useUploadChatAttachment,
} from "./hooks";
import { MessageComposer } from "./message-composer";
import { MessageList } from "./message-list";
import {
  type ChatConversationScope,
  filterChatConversationsByScope,
  getChatConversationTypesForScope,
  getConversationTitle,
  isReadOnlyChatConversation,
  normalizeChatConversationScope,
} from "./utils";

interface ChatWorkspaceProps {
  className?: string;
  defaultConversationScope?: ChatConversationScope;
  currentUserId: string;
  showSidebar?: boolean;
  variant?: "standalone" | "web";
  wsId: string;
}

export function ChatWorkspace({
  className,
  defaultConversationScope,
  currentUserId,
  showSidebar = true,
  variant = "web",
  wsId,
}: ChatWorkspaceProps) {
  const t = useTranslations("chat");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const conversationsQuery = useChatConversations(wsId);
  const allConversations = conversationsQuery.data ?? [];
  const requestedScope = searchParams.get("scope");
  const conversationScope =
    requestedScope || defaultConversationScope
      ? normalizeChatConversationScope(
          requestedScope ?? defaultConversationScope,
        )
      : null;
  const conversations = conversationScope
    ? filterChatConversationsByScope(allConversations, conversationScope)
    : allConversations;
  const conversationIds = useMemo(
    () => new Set(conversations.map((conversation) => conversation.id)),
    [conversations],
  );
  const selectedConversationId = searchParams.get("conversationId");
  const selectedConversation = useMemo(
    () =>
      (selectedConversationId && conversationIds.has(selectedConversationId)
        ? conversations.find((item) => item.id === selectedConversationId)
        : null) ??
      conversations[0] ??
      null,
    [conversationIds, conversations, selectedConversationId],
  );
  const activeConversationId = selectedConversation?.id ?? null;
  const selectedReadOnly = isReadOnlyChatConversation(selectedConversation);
  const selectedMembership =
    selectedConversation?.members.some(
      (member) => member.userId === currentUserId,
    ) ?? false;
  const messagesQuery = useChatMessages({
    conversationId: selectedReadOnly ? null : activeConversationId,
    wsId,
  });
  const messages = selectedReadOnly
    ? selectedConversation?.latestMessage
      ? [selectedConversation.latestMessage]
      : []
    : (messagesQuery.data ?? []);
  const sendMessage = useSendChatMessage({
    conversationId: activeConversationId,
    wsId,
  });
  const deleteConversation = useDeleteChatConversation(wsId);
  const updateConversation = useUpdateChatConversation(wsId);
  const uploadAttachment = useUploadChatAttachment({
    conversationId: activeConversationId,
    wsId,
  });
  const openAttachment = useOpenChatAttachment({
    conversationId: activeConversationId,
    wsId,
  });
  const toggleReaction = useToggleChatReaction({
    conversationId: activeConversationId,
    wsId,
  });
  const { mutate: markConversationRead } = useMarkChatConversationRead({
    conversationId: activeConversationId,
    wsId,
  });
  const searchQuery = useChatMessageSearch({
    query: searchValue,
    wsId,
  });
  const searchResults = (searchQuery.data ?? []).filter(
    (message) =>
      !conversationScope || conversationIds.has(message.conversationId),
  );
  const latestMessageId = messages.at(-1)?.id ?? null;

  useEffect(() => {
    if (selectedReadOnly) return;
    if (!selectedMembership) return;
    if (!activeConversationId || !latestMessageId) return;
    markConversationRead(latestMessageId);
  }, [
    activeConversationId,
    latestMessageId,
    markConversationRead,
    selectedMembership,
    selectedReadOnly,
  ]);

  const selectedTitle = selectedConversation
    ? getConversationTitle(selectedConversation, currentUserId, {
        ai: t("assistant_name"),
        channel: t("untitled_channel"),
        chat: t("untitled_chat"),
        direct: t("direct_message"),
        group: t("group_chat"),
      })
    : t("title");

  async function handleSend(payload: {
    attachments: ChatAttachmentDraft[];
    content: string;
  }) {
    try {
      await sendMessage.mutateAsync({
        attachments: payload.attachments,
        content: payload.content,
      });
    } catch {
      toast.error(t("message_send_failed"));
    }
  }

  async function handleOpenAttachment(attachment: ChatAttachment) {
    try {
      await openAttachment.mutateAsync(attachment.id);
    } catch {
      toast.error(t("attachment_open_failed"));
    }
  }

  function selectConversation(conversationId: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("conversationId", conversationId);
    const nextQuery = nextParams.toString();
    window.history.replaceState(
      null,
      "",
      nextQuery ? `${pathname}?${nextQuery}` : pathname,
    );
  }

  function handleCreated(conversation: ChatConversation) {
    selectConversation(conversation.id);
  }

  async function handleDeleteConversation() {
    if (!selectedConversation) return;

    try {
      await deleteConversation.mutateAsync(selectedConversation.id);
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("conversationId");
      const nextQuery = nextParams.toString();
      window.history.replaceState(
        null,
        "",
        nextQuery ? `${pathname}?${nextQuery}` : pathname,
      );
      toast.success(t("conversation_deleted"));
    } catch {
      toast.error(t("conversation_delete_failed"));
    }
  }

  async function handleUpdateConversation(payload: {
    description?: string | null;
    title?: string | null;
  }) {
    if (!selectedConversation) return;

    try {
      await updateConversation.mutateAsync({
        conversationId: selectedConversation.id,
        payload,
      });
      toast.success(t("conversation_updated"));
    } catch {
      toast.error(t("conversation_update_failed"));
    }
  }

  return (
    <section
      className={cn(
        "flex h-full min-h-[calc(100vh-9rem)] overflow-hidden rounded-md border bg-background text-foreground",
        variant === "standalone" && "min-h-dvh rounded-none border-0",
        className,
      )}
    >
      {showSidebar ? (
        <ChatSidebar
          conversations={conversations}
          currentUserId={currentUserId}
          isLoading={conversationsQuery.isLoading}
          onCreateConversation={() => setCreateOpen(true)}
          onSearchChange={setSearchValue}
          onSelectConversation={selectConversation}
          searchResults={searchResults}
          searchValue={searchValue}
          selectedConversationId={activeConversationId}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          conversation={selectedConversation}
          currentUserId={currentUserId}
          isDeletingConversation={deleteConversation.isPending}
          isFetching={messagesQuery.isFetching}
          isUpdatingConversation={updateConversation.isPending}
          onDeleteConversation={handleDeleteConversation}
          onUpdateConversation={handleUpdateConversation}
          title={selectedTitle}
        />

        {selectedConversation ? (
          <>
            <MessageList
              currentUserId={currentUserId}
              isLoading={messagesQuery.isLoading}
              messages={messages}
              onOpenAttachment={handleOpenAttachment}
              onToggleReaction={
                selectedReadOnly
                  ? undefined
                  : (messageId, emoji) =>
                      toggleReaction.mutate({ emoji, messageId })
              }
              readOnly={selectedReadOnly}
            />
            {selectedReadOnly ? (
              <div className="flex items-center justify-between gap-3 border-t bg-muted/25 px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  {t("read_only_conversation")}
                </span>
                <Badge variant="secondary">{t("agent_channel")}</Badge>
              </div>
            ) : (
              <MessageComposer
                disabled={!activeConversationId}
                isSending={sendMessage.isPending}
                isUploading={uploadAttachment.isPending}
                onSend={handleSend}
                onUploadFile={(file) => uploadAttachment.mutateAsync(file)}
              />
            )}
          </>
        ) : (
          <EmptyConversationState onCreate={() => setCreateOpen(true)} />
        )}
      </div>

      <CreateConversationDialog
        allowedTypes={
          conversationScope
            ? getChatConversationTypesForScope(conversationScope)
            : undefined
        }
        conversationScope={conversationScope ?? undefined}
        defaultType={
          conversationScope
            ? getChatConversationTypesForScope(conversationScope)[0]
            : undefined
        }
        currentUserId={currentUserId}
        onCreated={handleCreated}
        onOpenChange={setCreateOpen}
        open={createOpen}
        wsId={wsId}
      />
    </section>
  );
}

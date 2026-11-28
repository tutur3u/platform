part of 'chat_cubit.dart';

const _chatStateSentinel = Object();

enum ChatStatus { initial, loading, loaded, error }

enum ChatMessageStatus { initial, loading, loaded, error }

class ChatState extends Equatable {
  const ChatState({
    this.wsId,
    this.status = ChatStatus.initial,
    this.messageStatus = ChatMessageStatus.initial,
    this.scope = ChatScope.workspaces,
    this.archivedFilter = ChatArchivedFilter.active,
    this.typeFilters = const {
      ChatConversationType.ai,
      ChatConversationType.channel,
      ChatConversationType.direct,
      ChatConversationType.group,
    },
    this.conversations = const [],
    this.messages = const {},
    this.selectedConversationId,
    this.pendingAttachments = const [],
    this.directoryResults = const [],
    this.searchResults = const [],
    this.friendRequests = const ChatFriendRequests(),
    this.sharedContent,
    this.aiSettings,
    this.aiObservability,
    this.typingUserIds = const {},
    this.streamingAssistantText = '',
    this.nextOffset,
    this.isLoadingMore = false,
    this.isSending = false,
    this.isUploadingAttachment = false,
    this.canManageChat = false,
    this.canModerate = false,
    this.conversationSearchResults,
    this.replyToMessageId,
    this.hasOlderMessages = const {},
    this.loadingOlderConversationId,
    this.blockedUsers = const [],
    this.blockedConversationIds = const {},
    this.heldDraft,
    this.error,
  });

  final String? wsId;
  final ChatStatus status;
  final ChatMessageStatus messageStatus;
  final ChatScope scope;
  final ChatArchivedFilter archivedFilter;
  final Set<ChatConversationType> typeFilters;
  final List<ChatConversation> conversations;
  final Map<String, List<ChatMessage>> messages;
  final String? selectedConversationId;
  final List<ChatAttachment> pendingAttachments;

  /// An AI send the server refused for missing Mira AI data consent; the
  /// composer of that conversation takes its text back.
  final ({String conversationId, String text})? heldDraft;
  final List<ChatUserProfile> directoryResults;
  final List<ChatMessage> searchResults;
  final ChatFriendRequests friendRequests;
  final ChatSharedContent? sharedContent;
  final ChatAiSettings? aiSettings;
  final ChatAiObservability? aiObservability;
  final Set<String> typingUserIds;
  final String streamingAssistantText;
  final int? nextOffset;
  final bool isLoadingMore;
  final bool isSending;
  final bool isUploadingAttachment;
  final bool canManageChat;

  /// Whether the viewer may delete other members' messages in this
  /// workspace's conversations, as the conversations route reports. The
  /// server still enforces it on delete.
  final bool canModerate;

  /// The server's conversation matches for the open search, or null while
  /// none have arrived (the loaded list is matched by name meanwhile).
  final List<ChatConversation>? conversationSearchResults;

  /// Message the composer answers; sent as `replyToMessageId`.
  final String? replyToMessageId;

  /// Conversations whose last history page was full, keyed by id.
  final Map<String, bool> hasOlderMessages;

  /// Conversation whose older history is loading; one thread's request never
  /// shows a spinner in another.
  final String? loadingOlderConversationId;

  /// People the viewer blocked. Their content is hidden on this device too,
  /// since realtime events are not filtered by the server.
  final List<ChatBlockedUser> blockedUsers;

  /// Direct conversations whose send the server refused as blocked, which
  /// covers being blocked by the other person.
  final Set<String> blockedConversationIds;

  Set<String> get blockedUserIds => {
    for (final block in blockedUsers) block.userId,
  };

  /// Whether [message] was sent by someone the viewer blocked.
  bool isFromBlockedSender(ChatMessage message, [Set<String>? blocked]) {
    final ids = blocked ?? blockedUserIds;
    if (ids.isEmpty) return false;
    final senderId = message.senderId ?? message.sender?.id;
    return senderId != null && ids.contains(senderId);
  }

  /// The open thread without messages from blocked senders, and without
  /// blocked people in reaction counts. Filtering here rather than on
  /// arrival also hides content that landed before the blocked set loaded.
  List<ChatMessage> get visibleSelectedMessages {
    final blocked = blockedUserIds;
    final all = selectedMessages;
    if (blocked.isEmpty) return all;
    return [
      for (final message in all)
        if (!isFromBlockedSender(message, blocked))
          _withoutBlockedReactions(message, blocked),
    ];
  }

  /// Typists in the open thread, leaving out blocked people.
  Set<String> get visibleTypingUserIds {
    final blocked = blockedUserIds;
    return blocked.isEmpty ? typingUserIds : typingUserIds.difference(blocked);
  }

  /// [message] with blocked people removed from its reactions; a reaction
  /// left with nobody is dropped.
  static ChatMessage _withoutBlockedReactions(
    ChatMessage message,
    Set<String> blocked,
  ) {
    final touched = message.reactions.any(
      (reaction) => reaction.userIds.any(blocked.contains),
    );
    if (!touched) return message;
    final reactions = <ChatReactionSummary>[];
    for (final reaction in message.reactions) {
      final kept = reaction.userIds
          .where((id) => !blocked.contains(id))
          .toList(growable: false);
      final removed = reaction.userIds.length - kept.length;
      if (removed == 0) {
        reactions.add(reaction);
        continue;
      }
      final remaining = reaction.count - removed;
      final count = remaining < kept.length ? kept.length : remaining;
      if (count <= 0) continue;
      reactions.add(
        ChatReactionSummary(emoji: reaction.emoji, count: count, userIds: kept),
      );
    }
    return message.copyWith(reactions: reactions);
  }

  /// Directory matches without blocked people.
  List<ChatUserProfile> get visibleDirectoryResults {
    final blocked = blockedUserIds;
    return blocked.isEmpty
        ? directoryResults
        : directoryResults
              .where((user) => !blocked.contains(user.id))
              .toList(growable: false);
  }

  /// Message search matches without blocked senders.
  List<ChatMessage> get visibleSearchResults {
    final blocked = blockedUserIds;
    return blocked.isEmpty
        ? searchResults
        : searchResults
              .where((message) => !isFromBlockedSender(message, blocked))
              .toList(growable: false);
  }

  /// Friend requests without any that involve a blocked person.
  ChatFriendRequests get visibleFriendRequests {
    final blocked = blockedUserIds;
    if (blocked.isEmpty) return friendRequests;
    List<ChatFriendRequest> keep(List<ChatFriendRequest> requests) => requests
        .where(
          (request) =>
              !blocked.contains(request.requesterUserId) &&
              !blocked.contains(request.recipientUserId),
        )
        .toList(growable: false);
    return ChatFriendRequests(
      accepted: keep(friendRequests.accepted),
      incoming: keep(friendRequests.incoming),
      outgoing: keep(friendRequests.outgoing),
    );
  }

  /// Whether the open direct conversation is blocked either way, so the
  /// composer is replaced by an explanation.
  bool get isSelectedComposerBlocked {
    final conversation = selectedConversation;
    if (conversation == null ||
        conversation.type != ChatConversationType.direct) {
      return false;
    }
    if (blockedConversationIds.contains(conversation.id)) return true;
    final blocked = blockedUserIds;
    return conversation.members.any(
      (member) => blocked.contains(member.userId),
    );
  }

  bool get isLoadingOlderMessages =>
      loadingOlderConversationId != null &&
      loadingOlderConversationId == selectedConversationId;
  final String? error;

  /// The message being answered, or null when it is not loaded or deleted.
  ChatMessage? get replyToMessage {
    final replyId = replyToMessageId;
    if (replyId == null) return null;
    for (final message in selectedMessages) {
      if (message.id == replyId) {
        return message.deletedAt == null && !isFromBlockedSender(message)
            ? message
            : null;
      }
    }
    return null;
  }

  /// Whether the viewer may delete others' messages in the open thread:
  /// they moderate this workspace and it is one of its server
  /// conversations, which is what the delete route checks.
  bool get canModerateSelected {
    final conversation = selectedConversation;
    return canModerate &&
        conversation != null &&
        conversation.wsId == wsId &&
        conversation.type != ChatConversationType.ai &&
        !conversation.isReadOnlyAgent &&
        ChatCubit.isServerConversationId(conversation.id);
  }

  bool get selectedHasOlderMessages {
    final selectedId = selectedConversationId;
    return selectedId != null && (hasOlderMessages[selectedId] ?? false);
  }

  ChatConversation? get selectedConversation {
    final selectedId = selectedConversationId;
    if (selectedId == null) return null;
    for (final conversation in conversations) {
      if (conversation.id == selectedId) return conversation;
    }
    return null;
  }

  List<ChatMessage> get selectedMessages {
    final selectedId = selectedConversationId;
    if (selectedId == null) return const [];
    return messages[selectedId] ?? const [];
  }

  /// Conversations of the current scope and filters. One whose latest
  /// message came from a blocked sender shows no preview.
  List<ChatConversation> get visibleConversations {
    final blocked = blockedUserIds;
    return [
      for (final conversation in conversations)
        if (_matchesScope(conversation))
          switch (conversation.latestMessage) {
            final latest? when isFromBlockedSender(latest, blocked) =>
              conversation.copyWith(clearLatestMessage: true),
            _ => conversation,
          },
    ];
  }

  bool _matchesScope(ChatConversation conversation) {
    final matchesScope = scope == ChatScope.personal
        ? conversation.type == ChatConversationType.direct ||
              conversation.type == ChatConversationType.group
        : conversation.type == ChatConversationType.channel ||
              conversation.type == ChatConversationType.ai;
    return matchesScope && typeFilters.contains(conversation.type);
  }

  ChatState copyWith({
    Object? wsId = _chatStateSentinel,
    ChatStatus? status,
    ChatMessageStatus? messageStatus,
    ChatScope? scope,
    ChatArchivedFilter? archivedFilter,
    Set<ChatConversationType>? typeFilters,
    List<ChatConversation>? conversations,
    Map<String, List<ChatMessage>>? messages,
    Object? selectedConversationId = _chatStateSentinel,
    List<ChatAttachment>? pendingAttachments,
    List<ChatUserProfile>? directoryResults,
    List<ChatMessage>? searchResults,
    ChatFriendRequests? friendRequests,
    Object? sharedContent = _chatStateSentinel,
    Object? aiSettings = _chatStateSentinel,
    Object? aiObservability = _chatStateSentinel,
    Set<String>? typingUserIds,
    String? streamingAssistantText,
    Object? nextOffset = _chatStateSentinel,
    bool? isLoadingMore,
    bool? isSending,
    bool? isUploadingAttachment,
    bool? canManageChat,
    bool? canModerate,
    Object? conversationSearchResults = _chatStateSentinel,
    Object? replyToMessageId = _chatStateSentinel,
    Map<String, bool>? hasOlderMessages,
    Object? loadingOlderConversationId = _chatStateSentinel,
    List<ChatBlockedUser>? blockedUsers,
    Set<String>? blockedConversationIds,
    Object? heldDraft = _chatStateSentinel,
    Object? error = _chatStateSentinel,
    bool clearError = false,
  }) {
    return ChatState(
      wsId: wsId == _chatStateSentinel ? this.wsId : wsId as String?,
      status: status ?? this.status,
      messageStatus: messageStatus ?? this.messageStatus,
      scope: scope ?? this.scope,
      archivedFilter: archivedFilter ?? this.archivedFilter,
      typeFilters: typeFilters ?? this.typeFilters,
      conversations: conversations ?? this.conversations,
      messages: messages ?? this.messages,
      selectedConversationId: selectedConversationId == _chatStateSentinel
          ? this.selectedConversationId
          : selectedConversationId as String?,
      pendingAttachments: pendingAttachments ?? this.pendingAttachments,
      directoryResults: directoryResults ?? this.directoryResults,
      searchResults: searchResults ?? this.searchResults,
      friendRequests: friendRequests ?? this.friendRequests,
      sharedContent: sharedContent == _chatStateSentinel
          ? this.sharedContent
          : sharedContent as ChatSharedContent?,
      aiSettings: aiSettings == _chatStateSentinel
          ? this.aiSettings
          : aiSettings as ChatAiSettings?,
      aiObservability: aiObservability == _chatStateSentinel
          ? this.aiObservability
          : aiObservability as ChatAiObservability?,
      typingUserIds: typingUserIds ?? this.typingUserIds,
      streamingAssistantText:
          streamingAssistantText ?? this.streamingAssistantText,
      nextOffset: nextOffset == _chatStateSentinel
          ? this.nextOffset
          : nextOffset as int?,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      isSending: isSending ?? this.isSending,
      isUploadingAttachment:
          isUploadingAttachment ?? this.isUploadingAttachment,
      canManageChat: canManageChat ?? this.canManageChat,
      canModerate: canModerate ?? this.canModerate,
      conversationSearchResults: conversationSearchResults == _chatStateSentinel
          ? this.conversationSearchResults
          : conversationSearchResults as List<ChatConversation>?,
      replyToMessageId: replyToMessageId == _chatStateSentinel
          ? this.replyToMessageId
          : replyToMessageId as String?,
      hasOlderMessages: hasOlderMessages ?? this.hasOlderMessages,
      loadingOlderConversationId:
          loadingOlderConversationId == _chatStateSentinel
          ? this.loadingOlderConversationId
          : loadingOlderConversationId as String?,
      blockedUsers: blockedUsers ?? this.blockedUsers,
      blockedConversationIds:
          blockedConversationIds ?? this.blockedConversationIds,
      heldDraft: heldDraft == _chatStateSentinel
          ? this.heldDraft
          : heldDraft as ({String conversationId, String text})?,
      error: clearError
          ? null
          : error == _chatStateSentinel
          ? this.error
          : error as String?,
    );
  }

  @override
  List<Object?> get props => [
    wsId,
    status,
    messageStatus,
    scope,
    archivedFilter,
    typeFilters,
    conversations,
    messages,
    selectedConversationId,
    pendingAttachments,
    directoryResults,
    searchResults,
    friendRequests,
    sharedContent,
    aiSettings,
    aiObservability,
    typingUserIds,
    streamingAssistantText,
    nextOffset,
    isLoadingMore,
    isSending,
    isUploadingAttachment,
    canManageChat,
    canModerate,
    conversationSearchResults,
    replyToMessageId,
    hasOlderMessages,
    loadingOlderConversationId,
    blockedUsers,
    blockedConversationIds,
    heldDraft,
    error,
  ];
}

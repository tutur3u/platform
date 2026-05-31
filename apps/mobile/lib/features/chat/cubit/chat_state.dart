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
  final String? error;

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

  List<ChatConversation> get visibleConversations {
    return conversations
        .where((conversation) {
          final matchesScope = scope == ChatScope.personal
              ? conversation.type == ChatConversationType.direct ||
                    conversation.type == ChatConversationType.group
              : conversation.type == ChatConversationType.channel ||
                    conversation.type == ChatConversationType.ai;
          return matchesScope && typeFilters.contains(conversation.type);
        })
        .toList(growable: false);
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
    error,
  ];
}

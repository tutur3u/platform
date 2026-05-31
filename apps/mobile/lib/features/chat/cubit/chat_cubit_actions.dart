part of 'chat_cubit.dart';

extension ChatCubitActions on ChatCubit {
  void clearSelection() {
    _emitState(
      state.copyWith(
        selectedConversationId: null,
        messageStatus: ChatMessageStatus.initial,
        streamingAssistantText: '',
        sharedContent: null,
        aiSettings: null,
        aiObservability: null,
      ),
    );
  }

  void setScope(ChatScope scope) {
    _emitState(state.copyWith(scope: scope));
  }

  void toggleType(ChatConversationType type) {
    final next = Set<ChatConversationType>.from(state.typeFilters);
    if (next.contains(type) && next.length > 1) {
      next.remove(type);
    } else {
      next.add(type);
    }
    _emitState(state.copyWith(typeFilters: next));
  }

  Future<void> setArchivedFilter(ChatArchivedFilter filter) async {
    if (state.archivedFilter == filter) return;
    _emitState(state.copyWith(archivedFilter: filter));
    await refresh();
  }

  Future<ChatConversation?> createConversation({
    required ChatConversationType type,
    String? title,
    String? description,
    List<String> participantUserIds = const [],
    bool? aiEnabled,
    bool? autoReply,
    String? modelId,
    String? systemPrompt,
  }) async {
    final wsId = state.wsId;
    if (wsId == null) return null;

    try {
      final conversation = await _repository.createConversation(
        wsId,
        type: type,
        title: title,
        description: description,
        participantUserIds: participantUserIds,
        aiEnabled: aiEnabled,
        autoReply: autoReply,
        modelId: modelId,
        systemPrompt: systemPrompt,
      );
      _upsertConversation(conversation, select: true);
      await selectConversation(conversation.id, forceRefresh: true);
      return conversation;
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
      return null;
    }
  }

  Future<void> sendMessage(String content) async {
    final wsId = state.wsId;
    final conversation = state.selectedConversation;
    final trimmed = content.trim();
    if (wsId == null ||
        conversation == null ||
        (trimmed.isEmpty && state.pendingAttachments.isEmpty) ||
        state.isSending) {
      return;
    }

    final attachments = state.pendingAttachments
        .map((attachment) => attachment.toDraft())
        .toList(growable: false);
    _emitState(
      state.copyWith(
        isSending: true,
        pendingAttachments: const [],
        streamingAssistantText: '',
        clearError: true,
      ),
    );

    await _sendSubscription?.cancel();
    _sendSubscription = _repository
        .sendMessageStream(
          wsId,
          conversation.id,
          content: trimmed,
          attachments: attachments,
        )
        .listen(
          _handleMessageStreamEvent,
          onError: (Object error) {
            if (isClosed) return;
            _emitState(
              state.copyWith(
                isSending: false,
                streamingAssistantText: '',
                error: error.toString(),
              ),
            );
          },
          onDone: () {
            if (isClosed) return;
            _emitState(
              state.copyWith(
                isSending: false,
                streamingAssistantText: '',
              ),
            );
          },
        );
  }

  Future<void> uploadAttachment(PlatformFile file) async {
    final wsId = state.wsId;
    final conversationId = state.selectedConversationId;
    if (wsId == null || conversationId == null) return;

    _emitState(state.copyWith(isUploadingAttachment: true, clearError: true));
    try {
      final attachment = await _repository.uploadAttachment(
        wsId,
        conversationId,
        file: file,
      );
      if (isClosed) return;
      _emitState(
        state.copyWith(
          pendingAttachments: [...state.pendingAttachments, attachment],
          isUploadingAttachment: false,
        ),
      );
    } on ApiException catch (error) {
      if (!isClosed) {
        _emitState(
          state.copyWith(
            isUploadingAttachment: false,
            error: error.message,
          ),
        );
      }
    }
  }

  void removePendingAttachment(String attachmentId) {
    _emitState(
      state.copyWith(
        pendingAttachments: state.pendingAttachments
            .where((attachment) => attachment.id != attachmentId)
            .toList(growable: false),
      ),
    );
  }

  Future<void> toggleReaction(ChatMessage message, String emoji) async {
    final wsId = state.wsId;
    if (wsId == null) return;
    try {
      final updated = await _repository.toggleReaction(
        wsId,
        message.conversationId,
        messageId: message.id,
        emoji: emoji,
      );
      _upsertMessage(updated);
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
    }
  }

  Future<void> togglePin(ChatConversation conversation) async {
    final wsId = state.wsId;
    if (wsId == null) return;
    try {
      final updated = await _repository.updateConversation(
        wsId,
        conversation.id,
        pinned: !conversation.isPinned,
      );
      _upsertConversation(updated);
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
    }
  }

  Future<void> deleteConversation(ChatConversation conversation) async {
    final wsId = state.wsId;
    if (wsId == null) return;
    try {
      await _repository.deleteConversation(wsId, conversation.id);
      _removeConversation(conversation.id);
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
    }
  }

  Future<void> searchDirectory(String query) async {
    final wsId = state.wsId;
    if (wsId == null || query.trim().length < 2) {
      _emitState(state.copyWith(directoryResults: const []));
      return;
    }
    try {
      final users = await _repository.searchDirectory(wsId, query.trim());
      if (!isClosed) _emitState(state.copyWith(directoryResults: users));
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
    }
  }

  Future<void> searchMessages(String query) async {
    final wsId = state.wsId;
    if (wsId == null || query.trim().length < 2) {
      _emitState(state.copyWith(searchResults: const []));
      return;
    }
    try {
      final messages = await _repository.searchMessages(wsId, query.trim());
      if (!isClosed) _emitState(state.copyWith(searchResults: messages));
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
    }
  }

  Future<void> loadFriendRequests() async {
    final wsId = state.wsId;
    if (wsId == null) return;
    try {
      final friendRequests = await _repository.listFriendRequests(wsId);
      if (!isClosed) _emitState(state.copyWith(friendRequests: friendRequests));
    } on ApiException {
      // Friend requests are secondary chrome; keep the main chat usable.
    }
  }

  Future<void> createFriendRequest(String email) async {
    final wsId = state.wsId;
    if (wsId == null || email.trim().isEmpty) return;
    try {
      await _repository.createFriendRequest(wsId, email: email.trim());
      await loadFriendRequests();
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
    }
  }

  Future<void> respondFriendRequest(
    ChatFriendRequest request,
    ChatFriendRequestStatus status,
  ) async {
    final wsId = state.wsId;
    if (wsId == null) return;
    try {
      await _repository.respondFriendRequest(
        wsId,
        request.id,
        status: status,
      );
      await loadFriendRequests();
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
    }
  }

  Future<void> revokeFriendRequest(ChatFriendRequest request) async {
    final wsId = state.wsId;
    if (wsId == null) return;
    try {
      await _repository.revokeFriendRequest(wsId, request.id);
      await loadFriendRequests();
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
    }
  }

  Future<void> loadConversationPanels() async {
    final wsId = state.wsId;
    final conversation = state.selectedConversation;
    if (wsId == null || conversation == null) return;

    try {
      final sharedContentFuture = _repository.getSharedContent(
        wsId,
        conversation.id,
      );
      final aiSettingsFuture = conversation.type == ChatConversationType.ai
          ? _repository.getAiSettings(wsId, conversation.id)
          : Future<ChatAiSettings?>.value();
      final aiObservabilityFuture =
          conversation.type == ChatConversationType.ai && state.canManageChat
          ? _repository.getAiObservability(wsId, conversation.id)
          : Future<ChatAiObservability?>.value();

      final results = await Future.wait<Object?>([
        sharedContentFuture,
        aiSettingsFuture,
        aiObservabilityFuture,
      ]);
      if (isClosed || state.selectedConversationId != conversation.id) return;
      _emitState(
        state.copyWith(
          sharedContent: results[0] as ChatSharedContent?,
          aiSettings: results[1] as ChatAiSettings?,
          aiObservability: results[2] as ChatAiObservability?,
        ),
      );
    } on ApiException catch (error) {
      if (!isClosed) _emitState(state.copyWith(error: error.message));
    }
  }

  Future<void> updateAiSettings({
    ChatAiCreditSource? creditSource,
    String? creditWsId,
    String? modelId,
    String? systemPrompt,
    ChatAiThinkingMode? thinkingMode,
  }) async {
    final wsId = state.wsId;
    final conversation = state.selectedConversation;
    if (wsId == null || conversation == null) return;
    try {
      final settings = await _repository.updateAiSettings(
        wsId,
        conversation.id,
        creditSource: creditSource,
        creditWsId: creditWsId,
        modelId: modelId,
        systemPrompt: systemPrompt,
        thinkingMode: thinkingMode,
      );
      if (!isClosed) _emitState(state.copyWith(aiSettings: settings));
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
    }
  }
}

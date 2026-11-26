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
        replyToMessageId: null,
      ),
    );
    // Leaving the thread closes its room socket. An open socket is foreground
    // and would suppress push for a conversation the user is not reading.
    _syncConversationRoom();
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
    if (!_scopeActive) return null;
    final requestVersion = _loadToken;
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
      if (!_scopeActive || state.wsId != wsId || _loadToken != requestVersion) {
        return null;
      }
      _upsertConversation(conversation, select: true);
      if (_isPendingChatItem(wsId, conversation.id)) {
        _emitState(
          state.copyWith(
            messageStatus: ChatMessageStatus.loaded,
            messages: {
              ...state.messages,
              conversation.id: const <ChatMessage>[],
            },
          ),
        );
      } else {
        await selectConversation(conversation.id, forceRefresh: true);
      }
      return _scopeActive && state.wsId == wsId && _loadToken == requestVersion
          ? conversation
          : null;
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
      return null;
    }
  }

  Future<void> sendMessage(String content) async {
    if (!_scopeActive) return;
    stopTyping();
    final requestVersion = _loadToken;
    final wsId = state.wsId;
    final conversation = state.selectedConversation;
    final trimmed = content.trim();
    if (wsId == null ||
        conversation == null ||
        conversation.isReadOnlyAgent ||
        (trimmed.isEmpty && state.pendingAttachments.isEmpty) ||
        state.isSending) {
      return;
    }

    final attachments = state.pendingAttachments
        .map((attachment) => attachment.toDraft())
        .toList(growable: false);
    // Only a loaded, live, synced target is sent; a local row's id never
    // reaches the server.
    final replyTarget = state.replyToMessage;
    final replyToMessageId =
        replyTarget != null && isMessageSynced(replyTarget.id)
        ? replyTarget.id
        : null;
    _emitState(
      state.copyWith(
        isSending: true,
        pendingAttachments: const [],
        replyToMessageId: null,
        streamingAssistantText: '',
        clearError: true,
      ),
    );

    await _sendSubscription?.cancel();
    if (!_scopeActive ||
        state.wsId != wsId ||
        _loadToken != requestVersion ||
        state.selectedConversationId != conversation.id) {
      return;
    }
    _sendSubscription = _repository
        .sendMessageStream(
          wsId,
          conversation.id,
          content: trimmed,
          attachments: attachments,
          replyToMessageId: replyToMessageId,
        )
        .listen(
          _handleMessageStreamEvent,
          onError: (Object error) {
            if (!_scopeActive) return;
            _emitState(
              state.copyWith(
                isSending: false,
                streamingAssistantText: '',
                error: error.toString(),
              ),
            );
          },
          onDone: () {
            if (!_scopeActive) return;
            _emitState(
              state.copyWith(isSending: false, streamingAssistantText: ''),
            );
          },
        );
  }

  Future<void> uploadAttachment(PlatformFile file) async {
    if (!_scopeActive) return;
    final wsId = state.wsId;
    final conversationId = state.selectedConversationId;
    if (wsId == null ||
        conversationId == null ||
        (state.selectedConversation?.isReadOnlyAgent ?? false)) {
      return;
    }

    _emitState(state.copyWith(isUploadingAttachment: true, clearError: true));
    try {
      final attachment = await _repository.uploadAttachment(
        wsId,
        conversationId,
        file: file,
      );
      if (!_scopeActive) return;
      _emitState(
        state.copyWith(
          pendingAttachments: [...state.pendingAttachments, attachment],
          isUploadingAttachment: false,
        ),
      );
    } on ApiException catch (error) {
      if (_scopeActive) {
        _emitState(
          state.copyWith(isUploadingAttachment: false, error: error.message),
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

  /// Toggles the viewer's [emoji] on [message] through the idempotent
  /// desired-state API. Only the latest operation for a message and emoji
  /// may apply its reply or roll back, and a rollback restores just that
  /// emoji, so out-of-order replies cannot undo a newer tap.
  Future<void> toggleReaction(ChatMessage message, String emoji) async {
    if (!_scopeActive) return;
    final wsId = state.wsId;
    final userId = _currentUserId();
    if (wsId == null ||
        userId == null ||
        (state.selectedConversation?.isReadOnlyAgent ?? false) ||
        !isMessageSynced(message.id)) {
      return;
    }
    final current = _findMessage(message.conversationId, message.id) ?? message;
    final present = !current.reactions.any(
      (reaction) =>
          reaction.emoji == emoji && reaction.userIds.contains(userId),
    );
    final key = (message.id, emoji);
    final opId = newLocalMutationId();
    _latestReactionOps[key] = (opId: opId, present: present);
    _patchMessage(current);
    bool latest() => _latestReactionOps[key]?.opId == opId;
    try {
      final updated = await _repository.setReaction(
        wsId,
        message.conversationId,
        messageId: message.id,
        emoji: emoji,
        present: present,
        opId: opId,
      );
      if (!latest()) return;
      _latestReactionOps.remove(key);
      // A queued (offline) operation answers with an id-only placeholder;
      // keep the optimistic state until the server returns the message.
      if (updated.createdAt != null) _patchMessage(updated);
    } on Object catch (error) {
      if (!latest()) return;
      _latestReactionOps.remove(key);
      final now = _findMessage(message.conversationId, message.id);
      if (now != null) {
        _patchMessage(
          now.copyWith(
            reactions: reactionsWith(now.reactions, emoji, userId, !present),
          ),
        );
      }
      _emitState(
        state.copyWith(
          error: error is ApiException ? error.message : error.toString(),
        ),
      );
    }
  }

  Future<void> setMuted(
    ChatConversation conversation, {
    required String userId,
    required bool muted,
  }) async {
    if (!_scopeActive) return;
    final wsId = state.wsId;
    if (wsId == null || conversation.isReadOnlyAgent) return;
    try {
      final updated = await _repository.updateConversation(
        wsId,
        conversation.id,
        muted: muted,
      );
      _upsertConversation(
        _isPendingChatItem(wsId, conversation.id)
            ? conversation.copyWith(
                members: [
                  for (final member in conversation.members)
                    if (member.userId == userId)
                      ChatConversationMember(
                        id: member.id,
                        conversationId: member.conversationId,
                        userId: member.userId,
                        user: member.user,
                        role: member.role,
                        joinedAt: member.joinedAt,
                        lastReadAt: member.lastReadAt,
                        mutedAt: muted ? DateTime.now() : null,
                        pinnedAt: member.pinnedAt,
                        archivedAt: member.archivedAt,
                      )
                    else
                      member,
                ],
                updatedAt: DateTime.now(),
              )
            : updated,
      );
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
    }
  }

  Future<void> togglePin(ChatConversation conversation) async {
    if (!_scopeActive) return;
    final wsId = state.wsId;
    if (wsId == null || conversation.isReadOnlyAgent) return;
    try {
      final updated = await _repository.updateConversation(
        wsId,
        conversation.id,
        pinned: !conversation.isPinned,
      );
      _upsertConversation(
        _isPendingChatItem(wsId, conversation.id)
            ? conversation.copyWith(updatedAt: DateTime.now())
            : updated,
      );
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
    }
  }

  /// Archives or leaves [conversation]. Returns the failure message, or
  /// null on success. With [reportError] false the caller shows the failure
  /// itself and the page does not toast it as well.
  Future<String?> deleteConversation(
    ChatConversation conversation, {
    bool reportError = true,
  }) async {
    if (!_scopeActive) return null;
    final wsId = state.wsId;
    if (wsId == null || conversation.isReadOnlyAgent) return null;
    try {
      await _repository.deleteConversation(wsId, conversation.id);
      _removeConversation(conversation.id);
      return null;
    } on ApiException catch (error) {
      if (reportError) _emitState(state.copyWith(error: error.message));
      return error.message;
    }
  }

  Future<void> searchDirectory(String query) async {
    if (!_scopeActive) return;
    final wsId = state.wsId;
    if (wsId == null || query.trim().length < 2) {
      _emitState(state.copyWith(directoryResults: const []));
      return;
    }
    try {
      final users = await _repository.searchDirectory(wsId, query.trim());
      if (_scopeActive) _emitState(state.copyWith(directoryResults: users));
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
    }
  }

  Future<void> loadFriendRequests() async {
    if (!_scopeActive) return;
    final wsId = state.wsId;
    if (wsId == null) return;
    try {
      final friendRequests = await _repository.listFriendRequests(wsId);
      if (_scopeActive) {
        _emitState(state.copyWith(friendRequests: friendRequests));
      }
    } on ApiException {
      // Friend requests are secondary chrome; keep the main chat usable.
    }
  }

  Future<void> createFriendRequest(String email) async {
    if (!_scopeActive) return;
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
    if (!_scopeActive) return;
    final wsId = state.wsId;
    if (wsId == null) return;
    try {
      await _repository.respondFriendRequest(wsId, request.id, status: status);
      await loadFriendRequests();
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
    }
  }

  Future<void> revokeFriendRequest(ChatFriendRequest request) async {
    if (!_scopeActive) return;
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
    if (!_scopeActive) return;
    final wsId = state.wsId;
    final conversation = state.selectedConversation;
    if (wsId == null || conversation == null || conversation.isReadOnlyAgent) {
      return;
    }

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
      if (!_scopeActive || state.selectedConversationId != conversation.id) {
        return;
      }
      _emitState(
        state.copyWith(
          sharedContent: results[0] as ChatSharedContent?,
          aiSettings: results[1] as ChatAiSettings?,
          aiObservability: results[2] as ChatAiObservability?,
        ),
      );
    } on ApiException catch (error) {
      if (_scopeActive) _emitState(state.copyWith(error: error.message));
    }
  }

  Future<void> updateAiSettings({
    ChatAiCreditSource? creditSource,
    String? creditWsId,
    String? modelId,
    String? systemPrompt,
    ChatAiThinkingMode? thinkingMode,
  }) async {
    if (!_scopeActive) return;
    final wsId = state.wsId;
    final conversation = state.selectedConversation;
    if (wsId == null || conversation == null || conversation.isReadOnlyAgent) {
      return;
    }
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
      if (_scopeActive) _emitState(state.copyWith(aiSettings: settings));
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
    }
  }
}

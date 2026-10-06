part of 'assistant_live_cubit.dart';

extension _AssistantLivePersistence on AssistantLiveCubit {
  Future<void> retryPendingTurns() async {
    await _pendingPersistence;
    for (final save in _retryTurns.values.toList()) {
      await save();
    }
  }

  Future<void> _finalizeTurn() async {
    final wsId = state.workspaceId;
    final chatId = state.chatId;
    final model = state.model;
    if (wsId == null || chatId == null || model == null) {
      _clearDrafts();
      return;
    }

    final conversationVersion = _conversationVersion;
    final scopeToken = _sessionScopeToken;
    final userId = _sessionUserId;
    bool stale() =>
        isClosed ||
        conversationVersion != _conversationVersion ||
        scopeToken != _currentScopeToken() ||
        userId != _currentUserId();
    final turnParts = _turnParts;
    final pendingTools = _pendingTools;
    final actorId = _sessionUserId;
    final typedInput = _currentTypedInput;
    final userTranscript = _currentUserTranscript;
    final assistantTranscript = _currentAssistantTranscript;
    final attachments = _currentTurnAttachments
        .map(_serializeAttachment)
        .toList(growable: false);
    final userContent = _resolvedUserContent();
    final assistantContent = _resolvedAssistantContent();
    final hasAssistantMetadata =
        assistantTranscript.isNotEmpty ||
        _turnParts.toolCalls.isNotEmpty ||
        _turnParts.toolResults.isNotEmpty;
    final hasUserMetadata = userTranscript.isNotEmpty || attachments.isNotEmpty;

    if (userContent.isEmpty &&
        assistantContent.isEmpty &&
        !hasAssistantMetadata &&
        !hasUserMetadata) {
      _clearDrafts();
      return;
    }

    final turnId = _currentTurnId ?? _newTurnId();
    final snapshot = AssistantLiveTurnSnapshot(
      id: turnId,
      userText: typedInput,
      userTranscript: userTranscript,
      assistantText: _currentAssistantText,
      assistantTranscript: assistantTranscript,
      parts: turnParts,
      createdAt: DateTime.now(),
    );
    _sealedParts.add(turnParts);
    _clearDrafts();
    _emitMicrophoneState(
      state.copyWith(
        completedTurns: [...state.completedTurns, snapshot],
        isPersisting: true,
      ),
    );
    var durableWrite = false;
    Future<void> save() async {
      await pendingTools;
      if (stale()) return;
      final messages = <Map<String, dynamic>>[];
      if (userContent.isNotEmpty || hasUserMetadata) {
        messages.add({
          'role': 'user',
          'content': userContent,
          'metadata': {
            'source': 'live',
            if (typedInput.isNotEmpty) 'inputText': typedInput,
            if (userTranscript.isNotEmpty) 'inputTranscript': userTranscript,
            if (attachments.isNotEmpty) 'attachments': attachments,
          },
        });
      }

      if (assistantContent.isNotEmpty || hasAssistantMetadata) {
        messages.add({
          'role': 'assistant',
          'content': assistantContent,
          'metadata': {
            'source': 'live',
            if (assistantTranscript.isNotEmpty)
              'outputTranscript': assistantTranscript,
            if (turnParts.toolCalls.isNotEmpty)
              'toolCalls': turnParts.toolCalls,
            if (turnParts.toolResults.isNotEmpty)
              'toolResults': turnParts.toolResults,
            'parts': turnParts.toJson(),
          },
        });
      }

      _emitMicrophoneState(state.copyWith(isPersisting: true));
      try {
        Future<void> persist() => _repository.persistLiveTurn(
          wsId: wsId,
          chatId: chatId,
          turnId: turnId,
          model: model,
          messages: messages,
        );
        if (!durableWrite) {
          if (actorId == null) {
            await persist();
          } else {
            await ApiClient.runForUser(actorId, persist);
          }
          durableWrite = true;
        }
        if (stale()) return;
        await _onHistoryUpdated(wsId, chatId);
        if (stale()) return;
        final confirmed =
            _isTurnRestored?.call(
              wsId,
              chatId,
              turnId,
              messages.map((message) => message['role'] as String).toSet(),
            ) ??
            false;
        if (!confirmed) {
          _emitMicrophoneState(state.copyWith(isPersisting: false));
          return;
        }
        _sealedParts.remove(turnParts);
        _retryTurns.remove(turnId);
        _emitMicrophoneState(
          state.copyWith(
            completedTurns: state.completedTurns
                .where((turn) => turn.id != turnId)
                .toList(),
            isPersisting: false,
            clearError: true,
          ),
        );
      } on ApiException catch (error) {
        if (stale()) return;
        _emitError(error.message, preserveDrafts: true);
        return;
      } on Exception catch (error) {
        if (stale()) return;
        _emitError(error.toString(), preserveDrafts: true);
        return;
      }
    }

    _retryTurns[turnId] = save;
    final operation = _pendingPersistence.then((_) => save());
    _pendingPersistence = operation.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    await operation;
  }
}

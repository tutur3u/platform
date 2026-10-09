part of 'assistant_chat_cubit.dart';

extension _AssistantChatSubmission on AssistantChatCubit {
  Future<void> _submit({
    required String wsId,
    required String message,
    required String modelId,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String workspaceContextId,
    required String timezone,
    String? creditWsId,
    String? retryMessageId,
    bool Function()? isCurrent,
  }) async {
    bool current() => !isClosed && (isCurrent?.call() ?? true);
    if (!current()) return;
    final trimmed = message.trim();
    final uploadedAttachments = retryMessageId == null
        ? state.composerAttachments
              .where((attachment) => attachment.isUploaded)
              .toList()
        : (state.attachmentsByMessageId[retryMessageId] ??
                  const <AssistantAttachment>[])
              .where((attachment) => attachment.isUploaded)
              .toList();
    if (trimmed.isEmpty && uploadedAttachments.isEmpty) {
      return;
    }

    // Preserve the selected conversation until its identity and messages load.
    if (state.status == AssistantChatStatus.restoring) return;
    final queueMessage = trimmed.isEmpty
        ? 'Please analyze the attached file(s).'
        : trimmed;
    final queued = AssistantQueuedSubmission(
      message: queueMessage,
      attachments: uploadedAttachments,
    );

    final isDuplicate = _queue.any((item) => item.message == queued.message);
    if (!isDuplicate || uploadedAttachments.isNotEmpty) {
      _queue.add(queued);
    }

    final shouldPrimeUi = _shouldPrimeConversationUi(uploadedAttachments);
    final queuedMessages = _queue
        .map((item) => item.message)
        .toList(growable: false);

    if (shouldPrimeUi) {
      final optimisticMessage = AssistantMessage(
        id: _repository.generateUuid(),
        role: 'user',
        parts: [AssistantMessagePart(type: 'text', text: queueMessage)],
        createdAt: DateTime.now(),
      );
      final nextAttachments = Map<String, List<AssistantAttachment>>.from(
        state.attachmentsByMessageId,
      );
      if (uploadedAttachments.isNotEmpty) {
        nextAttachments[optimisticMessage.id] = uploadedAttachments;
      }

      _emitIfOpen(
        state.copyWith(
          queuedMessages: queuedMessages,
          chat: AssistantChatRecord(
            id: state.fallbackChatId,
            model: modelId,
            createdAt: DateTime.now(),
          ),
          messages: [...state.messages, optimisticMessage],
          attachmentsByMessageId: nextAttachments,
          composerAttachments: const [],
          clearError: true,
        ),
      );
    } else {
      _emitIfOpen(
        state.copyWith(queuedMessages: queuedMessages, clearError: true),
      );
    }

    if (state.isBusy) {
      await stopStreaming();
    }

    if (!current()) {
      _queue.remove(queued);
      if (!isClosed) {
        _emitIfOpen(
          state.copyWith(queuedMessages: _queue.map((q) => q.message).toList()),
        );
      }
      return;
    }
    _queueDebounce?.cancel();
    _queueDebounce = Timer(const Duration(milliseconds: 220), () {
      if (!current()) return;
      unawaited(
        _flushQueue(
          wsId: wsId,
          modelId: modelId,
          thinkingMode: thinkingMode,
          creditSource: creditSource,
          workspaceContextId: workspaceContextId,
          timezone: timezone,
          creditWsId: creditWsId,
          retryMessageId: retryMessageId,
          isCurrent: current,
        ),
      );
    });
  }

  Future<void> _flushQueue({
    required String wsId,
    required String modelId,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String workspaceContextId,
    required String timezone,
    String? creditWsId,
    String? retryMessageId,
    bool Function()? isCurrent,
  }) async {
    final workspaceVersion = _workspaceVersion;
    final operationVersion = ++_toolOperationVersion;
    final handledToolEffects = <String>{};
    bool current() =>
        !isClosed &&
        workspaceVersion == _workspaceVersion &&
        operationVersion == _toolOperationVersion &&
        (isCurrent?.call() ?? true);
    if (!current() || _queue.isEmpty) return;

    var phase = OperationalPhase.assistantCreate;
    var reportedFailure = false;
    void reportFailure(Object error) {
      if (!current() || reportedFailure) return;
      reportedFailure = true;
      _operationalReporter.report(phase, error);
    }

    try {
      final unique = <String>[];
      for (final item in _queue) {
        if (!unique.contains(item.message)) {
          unique.add(item.message);
        }
      }
      final attachments = _queue.expand((item) => item.attachments).toList();
      _queue.clear();

      final combined = unique.join('\n\n');
      var chat = state.chat;
      var chatId = chat?.id ?? state.fallbackChatId;

      _emitIfOpen(
        state.copyWith(
          status: AssistantChatStatus.submitting,
          queuedMessages: const [],
          clearError: true,
        ),
      );

      if (chat == null || state.storedChatId == null) {
        final created = await _repository.createChat(
          id: chatId,
          wsId: wsId,
          modelId: modelId,
          message: combined,
          timezone: timezone,
        );
        if (!current()) return;
        chat = created;
        chatId = created.id;
        phase = OperationalPhase.assistantPreferencePersist;
        await _preferences.saveChatId(wsId, chatId, shouldWrite: current);
        if (!current()) return;
        _emitIfOpen(state.copyWith(chat: created, storedChatId: chatId));
        // History is secondary to the first response. Refresh it without
        // delaying the stream after a conversation is created.
        unawaited(refreshHistory());
      }

      final shouldAppendUserMessage =
          retryMessageId == null &&
          !_matchesLatestQueuedMessage(state, combined, attachments);

      var nextMessages = state.messages;
      final attachmentsByMessageId =
          Map<String, List<AssistantAttachment>>.from(
            state.attachmentsByMessageId,
          );

      if (shouldAppendUserMessage) {
        final userMessage = AssistantMessage(
          id: _repository.generateUuid(),
          role: 'user',
          parts: [AssistantMessagePart(type: 'text', text: combined)],
          createdAt: DateTime.now(),
        );

        if (attachments.isNotEmpty) {
          attachmentsByMessageId[userMessage.id] = attachments;
        }

        nextMessages = [...state.messages, userMessage];
        _emitIfOpen(
          state.copyWith(
            messages: nextMessages,
            attachmentsByMessageId: attachmentsByMessageId,
            composerAttachments: const [],
          ),
        );
      }

      _activeAssistantMessageId = null;
      _activeTextBlockId = null;
      _activeReasoningBlockId = null;

      if (!current()) return;
      phase = OperationalPhase.assistantReply;
      _streamSubscription = _repository
          .streamChat(
            chatId: chatId,
            wsId: wsId,
            workspaceContextId: workspaceContextId,
            modelId: modelId,
            messages: nextMessages,
            thinkingMode: thinkingMode,
            creditSource: creditSource,
            timezone: timezone,
            attachments: attachments,
            creditWsId: creditWsId,
          )
          .listen(
            (event) {
              if (current()) {
                // Protocol errors lack a trustworthy persistence/status code.
                // Report the reply phase without interpreting server text.
                if (!reportedFailure &&
                    event is AssistantJsonStreamEvent &&
                    event.payload['type'] == 'error') {
                  reportedFailure = true;
                  _operationalReporter.reportStreamFailure();
                }
                _handleStreamEvent(
                  event,
                  isCurrent: current,
                  handledToolEffects: handledToolEffects,
                );
              }
            },
            onError: (Object error, StackTrace stackTrace) {
              if (!current()) return;
              reportFailure(error);
              _emitIfOpen(
                state.copyWith(
                  messages: _withoutEmptyAssistantReply(
                    state.messages,
                    _activeAssistantMessageId,
                  ),
                  status: AssistantChatStatus.error,
                  error: error.toString(),
                  diagnostics: SafeErrorDiagnostics.capture(
                    error,
                    DiagnosticStage.assistantReply,
                  ),
                ),
              );
            },
            onDone: () async {
              if (!current()) return;
              _streamSubscription = null;
              _finalizeToolParts();
              if (isClosed || state.status == AssistantChatStatus.error) return;
              _emitIfOpen(state.copyWith(status: AssistantChatStatus.idle));
              _persistAssistantChatCache();
            },
            cancelOnError: false,
          );
    } on Exception catch (error) {
      if (!current()) return;
      reportFailure(error);
      _emitIfOpen(
        state.copyWith(
          messages: _withoutEmptyAssistantReply(
            state.messages,
            _activeAssistantMessageId,
          ),
          status: AssistantChatStatus.error,
          error: error.toString(),
          diagnostics: SafeErrorDiagnostics.capture(
            error,
            DiagnosticStage.assistantReply,
          ),
        ),
      );
    }
  }
}

part of 'assistant_chat_cubit.dart';

extension _AssistantChatSubmission on AssistantChatCubit {
  Map<String, dynamic> _buildExportPayload({
    required String wsId,
    required AssistantGatewayModel model,
    required AssistantThinkingMode thinkingMode,
  }) {
    final chatId = state.chat?.id ?? state.fallbackChatId;
    return {
      'exportedAt': DateTime.now().toIso8601String(),
      'wsId': wsId,
      'chatId': chatId,
      'fallbackChatId': state.fallbackChatId,
      'status': state.status.name,
      'model': model.toJson(),
      'thinkingMode': thinkingMode.name,
      'chat': state.chat?.toJson(),
      'messages': state.messages.map((message) => message.toJson()).toList(),
      'messageAttachments': state.attachmentsByMessageId.map(
        (key, value) => MapEntry(
          key,
          value.map((attachment) => attachment.toJson()).toList(),
        ),
      ),
    };
  }

  bool _shouldPrimeConversationUi(List<AssistantAttachment> attachments) {
    return state.chat == null &&
        state.storedChatId == null &&
        state.messages.isEmpty &&
        !state.isBusy &&
        (attachments.isNotEmpty || _queue.isNotEmpty);
  }

  Future<AssistantSubmissionOutcome> _submitAcknowledged({
    required String wsId,
    required String message,
    required String modelId,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String workspaceContextId,
    required String timezone,
    String? creditWsId,
    bool Function()? isCurrent,
  }) async {
    final version = _workspaceVersion;
    bool current() =>
        !isClosed &&
        version == _workspaceVersion &&
        state.workspaceId == wsId &&
        (isCurrent?.call() ?? true);
    if (!current() ||
        _queue.isNotEmpty ||
        _submissionAcks.isNotEmpty ||
        state.status == AssistantChatStatus.restoring) {
      return const AssistantSubmissionOutcome.denied();
    }
    final requestId = assistantClientRequestId({
      'clientRequestId': _repository.generateUuid(),
    })!;
    final completion = Completer<AssistantSubmissionOutcome>();
    final text = message.trim().isEmpty
        ? 'Please analyze the attached file(s).'
        : message.trim();
    _submissionAcks[requestId] = (
      result: completion,
      text: text,
      attachments: state.composerAttachments,
    );
    void finish(AssistantSubmissionOutcome outcome) {
      if (!completion.isCompleted) completion.complete(outcome);
    }

    final observer = stream.listen((next) {
      if (!current()) {
        _staleSubmission(requestId);
        return;
      }
    }, onDone: () => _staleSubmission(requestId));
    try {
      final admitted = await _submit(
        wsId: wsId,
        message: message,
        modelId: modelId,
        thinkingMode: thinkingMode,
        creditSource: creditSource,
        workspaceContextId: workspaceContextId,
        timezone: timezone,
        creditWsId: creditWsId,
        isCurrent: current,
        clientRequestId: requestId,
      );
      if (!admitted) finish(const AssistantSubmissionOutcome.denied());
      return await completion.future;
    } finally {
      _submissionAcks.remove(requestId);
      late Future<void> cleanup;
      cleanup = Future<void>.sync(observer.cancel)
          .catchError((Object error) {
            if (current()) {
              _operationalReporter.report(
                OperationalPhase.assistantReply,
                error,
              );
            }
          })
          .whenComplete(() => _submissionObserverCleanups.remove(cleanup));
      _submissionObserverCleanups.add(cleanup);
      unawaited(cleanup);
    }
  }

  Future<void> _stopStreaming({required bool discardQueued}) async {
    final version = ++_toolOperationVersion;
    final queued = _queuedSubmissionRequestId;
    final active = _activeSubmissionRequestId;
    _queuedSubmissionRequestId = null;
    _activeSubmissionRequestId = null;
    _queueDebounce?.cancel();
    _unknownSubmission(queued, denied: true);
    _unknownSubmission(active);
    if (discardQueued || queued != null) {
      _queue.clear();
      _emitIfOpen(state.copyWith(queuedMessages: const []));
    }
    if (discardQueued) {
      for (final request in _submissionAcks.keys) {
        _unknownSubmission(request, denied: true);
      }
    }
    final subscription = _streamSubscription;
    _streamSubscription = null;
    await subscription?.cancel();
    if (!isClosed && version == _toolOperationVersion) {
      _emitIfOpen(state.copyWith(status: AssistantChatStatus.idle));
    }
  }

  void _unknownSubmission(String? requestId, {bool denied = false}) {
    final pending = _submissionAcks[requestId];
    if (pending != null && !pending.result.isCompleted) {
      pending.result.complete(
        denied
            ? const AssistantSubmissionOutcome.denied()
            : const AssistantSubmissionOutcome.unknown(),
      );
    }
  }

  void _staleSubmission(String? requestId) {
    final entry = _queuedSubmissionEntry;
    if (requestId != null &&
        requestId == _queuedSubmissionRequestId &&
        entry != null) {
      _queue.removeWhere((item) => identical(item, entry));
      _queuedSubmissionRequestId = null;
      _queuedSubmissionEntry = null;
      _queueDebounce?.cancel();
      _emitIfOpen(
        state.copyWith(queuedMessages: _queue.map((q) => q.message).toList()),
      );
    }
    final pending = _submissionAcks[requestId];
    if (pending != null && !pending.result.isCompleted) {
      pending.result.complete(const AssistantSubmissionOutcome.stale());
    }
  }

  void _completeSubmissionAcknowledgment(
    Map<String, dynamic> payload, {
    required bool matched,
  }) {
    final requestId = payload['clientRequestId'];
    final pending = _submissionAcks[requestId];
    if (pending == null || pending.result.isCompleted) return;
    if (!matched || payload['text'] != pending.text) {
      pending.result.complete(const AssistantSubmissionOutcome.unknown());
      return;
    }
    if (listEquals(state.composerAttachments, pending.attachments)) {
      _emitIfOpen(state.copyWith(composerAttachments: const []));
    }
    pending.result.complete(
      AssistantSubmissionOutcome.acknowledged(
        requestId as String,
        payload['messageId'] as String,
      ),
    );
  }

  Future<bool> _resetConversation(
    String wsId, {
    required bool acknowledgeUnknownCreation,
  }) async {
    final resetContext = _onResetWorkspaceContext;
    if (resetContext == null) return false;
    final actor = _repository.currentActorId;
    final selectedVersion = _workspaceVersion;
    bool selected() =>
        !isClosed &&
        actor != null &&
        _repository.currentActorId == actor &&
        _preferences.matchesResetActor(actor) &&
        selectedVersion == _workspaceVersion &&
        state.workspaceId == wsId;
    if (!selected()) return false;
    bool unknown;
    try {
      unknown = await _repository.hasUnknownChatCreation(wsId);
    } on Object {
      unknown = true;
    }
    if (!selected()) return false;
    if ((unknown || state.creationOutcomeUnknown) &&
        !acknowledgeUnknownCreation) {
      _emitIfOpen(state.copyWith(creationOutcomeUnknown: true));
      return false;
    }
    if (acknowledgeUnknownCreation) {
      await _repository.acknowledgeUnknownChatCreation(wsId);
    }
    if (!selected()) return false;
    final version = ++_workspaceVersion;
    bool current() =>
        !isClosed &&
        actor != null &&
        _repository.currentActorId == actor &&
        _preferences.matchesResetActor(actor) &&
        version == _workspaceVersion &&
        state.workspaceId == wsId;
    if (!await resetContext('personal', current) || !current()) return false;
    await _onChatRestored(null);
    if (!current()) return false;
    if (!await _preferences.clearChatIdAcknowledged(
          wsId,
          actorId: actor!,
          isCurrent: current,
        ) ||
        !current()) {
      return false;
    }
    await stopStreaming();
    if (!current()) return false;
    _repository.invalidateChatCreation();
    _queue.clear();
    _emitIfOpen(
      state.copyWith(
        status: AssistantChatStatus.idle,
        creationOutcomeUnknown: false,
        chat: null,
        storedChatId: null,
        messages: const [],
        attachmentsByMessageId: const {},
        composerAttachments: const [],
        fallbackChatId: _repository.generateUuid(),
        queuedMessages: const [],
      ),
    );
    return current();
  }

  Future<bool> _submit({
    required String wsId,
    required String message,
    required String modelId,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String workspaceContextId,
    required String timezone,
    String? creditWsId,
    String? retryMessageId,
    String? clientRequestId,
    bool Function()? isCurrent,
  }) async {
    bool current() => !isClosed && (isCurrent?.call() ?? true);
    if (!current()) return false;
    if (state.creationOutcomeUnknown &&
        (retryMessageId != null ||
            state.chat == null ||
            state.storedChatId == null)) {
      return false;
    }
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
      return false;
    }

    // Preserve the selected conversation until its identity and messages load.
    if (state.status == AssistantChatStatus.restoring) return false;
    // A failed cold restore still owns its selected conversation. Only an
    // explicit reset may turn that selection into a new-chat submission.
    if (state.storedChatId != null &&
        state.chat == null &&
        state.status == AssistantChatStatus.error) {
      return false;
    }
    if (retryMessageId != null &&
        state.messages
                .where((m) => m.id == retryMessageId)
                .firstOrNull
                ?.clientRequestId ==
            null) {
      _emitIfOpen(
        state.copyWith(
          status: AssistantChatStatus.error,
          error:
              'Original assistant request identity is unavailable. Reload '
              'history before retrying.',
        ),
      );
      return false;
    }
    final predecessor = _queuedSubmissionRequestId;
    if (predecessor != null && predecessor != clientRequestId) {
      _unknownSubmission(predecessor, denied: true);
      _queuedSubmissionRequestId = null;
      _queue.clear();
    }
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

    final shouldPrimeUi =
        _shouldPrimeConversationUi(uploadedAttachments) ||
        (state.chat == null &&
            state.storedChatId == null &&
            state.messages.isEmpty &&
            !state.isBusy);
    final queuedMessages = _queue
        .map((item) => item.message)
        .toList(growable: false);

    if (shouldPrimeUi) {
      final optimisticMessage = AssistantMessage(
        id: clientRequestId ?? _repository.generateUuid(),
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
          messages: [
            ...state.messages,
            optimisticMessage.copyWith(clientRequestId: optimisticMessage.id),
          ],
          attachmentsByMessageId: nextAttachments,
          composerAttachments: clientRequestId == null
              ? const []
              : state.composerAttachments,
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
      return false;
    }
    _queuedSubmissionRequestId = clientRequestId;
    _queuedSubmissionEntry = queued;
    _queueDebounce?.cancel();
    _queueDebounce = Timer(const Duration(milliseconds: 220), () {
      if (!current()) {
        _staleSubmission(clientRequestId);
        return;
      }
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
          clientRequestId: clientRequestId,
          isCurrent: current,
        ),
      );
    });
    return true;
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
    String? clientRequestId,
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
    if (!current() || _queue.isEmpty) {
      _staleSubmission(clientRequestId);
      return;
    }

    _queuedSubmissionRequestId = null;
    _queuedSubmissionEntry = null;
    _activeSubmissionRequestId = clientRequestId;
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
        _emitIfOpen(state.copyWith(creationOutcomeUnknown: true));
        final created = await _repository.createChat(
          id: chatId,
          wsId: wsId,
          modelId: modelId,
          message: combined,
          timezone: timezone,
        );
        if (!current()) {
          _staleSubmission(clientRequestId);
          return;
        }
        chat = created;
        chatId = created.id;
        phase = OperationalPhase.assistantPreferencePersist;
        await _preferences.saveChatId(wsId, chatId, shouldWrite: current);
        if (!current()) {
          _staleSubmission(clientRequestId);
          return;
        }
        _emitIfOpen(
          state.copyWith(
            chat: created,
            storedChatId: chatId,
            creationOutcomeUnknown: false,
          ),
        );
        // History is secondary to the first response. Refresh it without
        // delaying the stream after a conversation is created.
        unawaited(refreshHistory());
      }

      final shouldAppendUserMessage =
          retryMessageId == null &&
          (!_matchesLatestQueuedMessage(state, combined, attachments) ||
              (clientRequestId != null &&
                  state.messages
                          .lastWhere(
                            (message) => message.role == 'user',
                            orElse: () =>
                                const AssistantMessage(id: '', role: 'user'),
                          )
                          .clientRequestId !=
                      clientRequestId));

      var nextMessages = state.messages;
      final attachmentsByMessageId =
          Map<String, List<AssistantAttachment>>.from(
            state.attachmentsByMessageId,
          );

      if (shouldAppendUserMessage) {
        final userMessage = AssistantMessage(
          id: clientRequestId ?? _repository.generateUuid(),
          role: 'user',
          parts: [AssistantMessagePart(type: 'text', text: combined)],
          createdAt: DateTime.now(),
        );

        if (attachments.isNotEmpty) {
          attachmentsByMessageId[userMessage.id] = attachments;
        }

        nextMessages = [
          ...state.messages,
          userMessage.copyWith(clientRequestId: userMessage.id),
        ];
        _emitIfOpen(
          state.copyWith(
            messages: nextMessages,
            attachmentsByMessageId: attachmentsByMessageId,
            composerAttachments: clientRequestId == null
                ? const []
                : state.composerAttachments,
          ),
        );
      }

      _activeAssistantMessageId = null;
      _activeTextBlockId = null;
      _activeReasoningBlockId = null;

      if (!current()) {
        _staleSubmission(clientRequestId);
        return;
      }
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
              if (!current()) {
                _staleSubmission(clientRequestId);
                return;
              }
              if (current()) {
                // Protocol errors lack a trustworthy persistence/status code.
                // Report the reply phase without interpreting server text.
                if (!reportedFailure &&
                    event is AssistantJsonStreamEvent &&
                    event.payload['type'] == 'error') {
                  _unknownSubmission(clientRequestId);
                  reportedFailure = true;
                  _operationalReporter.reportStreamFailure();
                }
                try {
                  _handleStreamEvent(
                    event,
                    isCurrent: current,
                    handledToolEffects: handledToolEffects,
                  );
                } on Object catch (error) {
                  _unknownSubmission(clientRequestId);
                  reportFailure(error);
                  _emitIfOpen(
                    state.copyWith(
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
            },
            onError: (Object error, StackTrace stackTrace) {
              if (!current()) {
                _staleSubmission(clientRequestId);
                return;
              }
              _unknownSubmission(clientRequestId);
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
              if (!current()) {
                _staleSubmission(clientRequestId);
                return;
              }
              _unknownSubmission(clientRequestId);
              _streamSubscription = null;
              _finalizeToolParts();
              if (isClosed || state.status == AssistantChatStatus.error) return;
              _emitIfOpen(state.copyWith(status: AssistantChatStatus.idle));
              _persistAssistantChatCache();
            },
            cancelOnError: false,
          );
    } on Object catch (error) {
      if (!current()) {
        _staleSubmission(clientRequestId);
        return;
      }
      _unknownSubmission(
        clientRequestId,
        denied:
            phase == OperationalPhase.assistantCreate &&
            error is ApiException &&
            error.statusCode == 400 &&
            error.code == 'chat_create_invalid_request',
      );
      if (phase == OperationalPhase.assistantCreate &&
          error is ApiException &&
          error.statusCode == 400 &&
          error.code == 'chat_create_invalid_request') {
        _emitIfOpen(state.copyWith(creationOutcomeUnknown: false));
      }
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

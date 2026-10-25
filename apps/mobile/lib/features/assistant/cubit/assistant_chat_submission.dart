part of 'assistant_chat_cubit.dart';

final class _AssistantReplySubscription {
  _AssistantReplySubscription(this._subscription);

  final StreamSubscription<AssistantStreamEvent> _subscription;

  Future<void> cancel() => _subscription.cancel();
}

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
    await _cancelReplyStream();
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
    if (matched) {
      _nativePending.removeWhere(
        (_, turn) =>
            turn.actor == _repository.currentActorId &&
            turn.workspace == state.workspaceId &&
            turn.chat == state.storedChatId &&
            turn.requestId == requestId &&
            turn.text == payload['text'] &&
            matchesAssistantNativeUserAcknowledgment(
              payload['nativeReceipt'],
              actorId: turn.actor,
              wsId: turn.workspace,
              chatId: turn.chat,
              requestId: turn.requestId,
              messageId: payload['messageId'],
              text: turn.text,
              attachments: turn.attachments,
              replyToMessageId: turn.optimisticMessage?.replyToMessageId,
            ),
      );
    }
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
    final replyToMessageId = retryMessageId == null
        ? state.replyTarget?.id
        : state.messages
              .where((m) => m.id == retryMessageId)
              .firstOrNull
              ?.replyToMessageId;
    if (retryMessageId == null &&
        replyToMessageId != null &&
        !canPersistMessage(replyToMessageId)) {
      return false;
    }
    if (_queue.any((item) => item.replyToMessageId != replyToMessageId)) {
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
      replyToMessageId: replyToMessageId,
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

    AssistantMessage? primedOptimisticMessage;
    if (shouldPrimeUi) {
      final optimisticMessage = AssistantMessage(
        id: clientRequestId ?? _repository.generateUuid(),
        role: 'user',
        parts: [AssistantMessagePart(type: 'text', text: queueMessage)],
        createdAt: DateTime.now(),
        replyToMessageId: replyToMessageId,
      );
      final nextAttachments = Map<String, List<AssistantAttachment>>.from(
        state.attachmentsByMessageId,
      );
      if (uploadedAttachments.isNotEmpty) {
        nextAttachments[optimisticMessage.id] = uploadedAttachments;
      }

      final primedUserMessage = optimisticMessage.copyWith(
        clientRequestId: optimisticMessage.id,
      );
      primedOptimisticMessage = primedUserMessage;
      _emitIfOpen(
        state.copyWith(
          queuedMessages: queuedMessages,
          chat: AssistantChatRecord(
            id: state.fallbackChatId,
            model: modelId,
            createdAt: DateTime.now(),
          ),
          messages: [...state.messages, primedUserMessage],
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

    if (retryMessageId == null) clearReplyTarget();
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
    void flush() {
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
          primedOptimisticMessage: primedOptimisticMessage,
          isCurrent: current,
        ),
      );
    }

    if (shouldPrimeUi) {
      flush();
    } else {
      _queueDebounce = Timer(const Duration(milliseconds: 220), flush);
    }
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
    AssistantMessage? primedOptimisticMessage,
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
      final replyToMessageId = _queue.first.replyToMessageId;
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

      AssistantFirstMessageCreation? firstCreation;
      if (chat == null || state.storedChatId == null) {
        final prepared = await _prepareChatSubmission(
          chatId: chatId, wsId: wsId, modelId: modelId, message: combined,
          timezone: timezone, hasAttachments: attachments.isNotEmpty,
          current: current,
          onPersisting: () => phase = OperationalPhase.assistantPreferencePersist,
        );
        if (!current()) { _staleSubmission(clientRequestId); return; }
        if (prepared == null) return;
        switch (prepared) {
          case _SeparateCreatedChat(:final record):
            chat = record;
            chatId = record.id;
          case _FirstMessagePreparedChat(:final creation):
            firstCreation = creation;
        }
      }

      final shouldAppendUserMessage =
          retryMessageId == null &&
          !state.messages.any(
            (m) =>
                m.role == 'user' &&
                clientRequestId != null &&
                m.clientRequestId == clientRequestId,
          ) &&
          (!_matchesLatestQueuedMessage(
                state,
                combined,
                attachments,
                replyToMessageId: replyToMessageId,
              ) ||
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

      var optimisticUserMessage =
          primedOptimisticMessage ??
          state.messages.where((m) => m.id == retryMessageId).firstOrNull;
      if (shouldAppendUserMessage) {
        final userMessage = AssistantMessage(
          id: clientRequestId ?? _repository.generateUuid(),
          role: 'user',
          parts: [AssistantMessagePart(type: 'text', text: combined)],
          createdAt: DateTime.now(),
          replyToMessageId: replyToMessageId,
        );

        if (attachments.isNotEmpty) {
          attachmentsByMessageId[userMessage.id] = attachments;
        }

        optimisticUserMessage = userMessage.copyWith(
          clientRequestId: userMessage.id,
        );
        nextMessages = [...state.messages, optimisticUserMessage];
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
      final nativePending = _retainNativePending(
        wsId,
        chatId,
        clientRequestId,
        combined,
        attachments,
        optimisticMessage: optimisticUserMessage,
      );
      final actor = _repository.currentActorId;
      late final ApiMutationAdmission admission;
      admission = ApiMutationAdmission(
        actorId: actor ?? '',
        isCurrent: () =>
            actor != null && _repository.currentActorId == actor && current(),
        onNotDispatched: (failure) => _releaseDefinitelyUnsentNativePending(
          nativePending,
          admission,
          failure,
        ),
      );
      nativePending?.attempts.add(admission);
      phase = OperationalPhase.assistantReply;
      _streamAdmission = admission;
      _streamSubscription = _AssistantReplySubscription(
        _replyForSubmission(
              firstCreation: firstCreation,
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
              admission: admission,
            )
            .listen(
              (event) {
                if (event is AssistantJsonStreamEvent &&
                    event.payload['type'] == 'native-dispatch-admitted') {
                  nativePending?.admitted = true;
                }
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
                _releaseDefinitelyUnsentNativePending(
                  nativePending,
                  admission,
                  error,
                );
                _forgetUnsentNativePending(nativePending);
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
                _forgetUnsentNativePending(nativePending);
                if (!current()) {
                  _staleSubmission(clientRequestId);
                  return;
                }
                _unknownSubmission(clientRequestId);
                _streamSubscription = null;
                _streamAdmission = null;
                _finalizeToolParts();
                if (isClosed || state.status == AssistantChatStatus.error) {
                  return;
                }
                _emitIfOpen(state.copyWith(status: AssistantChatStatus.idle));
                _persistAssistantChatCache();
              },
              cancelOnError: false,
            ),
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

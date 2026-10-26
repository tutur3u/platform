part of 'assistant_chat_cubit.dart';

final class _NativePendingSubmission {
  _NativePendingSubmission(
    this.actor,
    this.workspace,
    this.chat,
    this.requestId,
    this.text,
    List<AssistantAttachment> attachments,
    this.optimisticMessage,
  ) : attachments = List.unmodifiable(attachments);
  final String actor;
  final String workspace;
  final String chat;
  final String requestId;
  final String text;
  final List<AssistantAttachment> attachments;
  final AssistantMessage? optimisticMessage;
  bool admitted = false;
  final attempts = <ApiMutationAdmission>[];
}

extension _AssistantNativePending on AssistantChatCubit {
  _NativePendingSubmission? _nativePendingFor(String wsId) =>
      _nativePending[(_repository.currentActorId, wsId, state.storedChatId)];

  _NativePendingSubmission? _retainNativePending(
    String wsId,
    String chatId,
    String? requestId,
    String text,
    List<AssistantAttachment> attachments, {
    AssistantMessage? optimisticMessage,
  }) {
    final actor = _repository.currentActorId;
    if (actor == null || requestId == null || !isUuid(chatId)) return null;
    return _nativePending.putIfAbsent(
      (actor, wsId, chatId),
      () => _NativePendingSubmission(
        actor,
        wsId,
        chatId,
        requestId,
        text,
        attachments,
        optimisticMessage,
      ),
    );
  }

  void _forgetUnsentNativePending(_NativePendingSubmission? turn) {
    if (turn == null || turn.admitted) return;
    final key = (turn.actor, turn.workspace, turn.chat);
    if (identical(_nativePending[key], turn)) _nativePending.remove(key);
  }

  void _releaseDefinitelyUnsentNativePending(
    _NativePendingSubmission? turn,
    ApiMutationAdmission admission,
    Object error,
  ) {
    if (turn == null ||
        error is! ApiMutationNotDispatched ||
        !identical(error.admission, admission) ||
        !identical(turn.attempts.lastOrNull, admission) ||
        !turn.attempts.every((attempt) => attempt.definitelyNotDispatched)) {
      return;
    }
    final key = (turn.actor, turn.workspace, turn.chat);
    if (!identical(_nativePending[key], turn)) return;
    _nativePending.remove(key);
    _unknownSubmission(turn.requestId, denied: true);
    // Remove only this still-optimistic row in its owning visible scope.
    if (_repository.currentActorId != turn.actor ||
        state.workspaceId != turn.workspace ||
        state.storedChatId != turn.chat) {
      return;
    }
    final optimistic = state.messages.where(
      (m) =>
          identical(m, turn.optimisticMessage) &&
          m.role == 'user' &&
          m.id == turn.requestId &&
          m.clientRequestId == turn.requestId,
    );
    final ownsActive = _activeSubmissionRequestId == turn.requestId;
    if (optimistic.isEmpty && !ownsActive) return;
    if (ownsActive) {
      _activeSubmissionRequestId = null;
      _streamSubscription = null;
    }
    final attachments = {...state.attachmentsByMessageId};
    if (optimistic.isNotEmpty) attachments.remove(turn.requestId);
    _emitIfOpen(
      state.copyWith(
        status: ownsActive ? AssistantChatStatus.idle : state.status,
        messages: state.messages.where((m) => !optimistic.contains(m)).toList(),
        attachmentsByMessageId: attachments,
      ),
    );
  }

  Future<AssistantSubmissionOutcome> _reconcileNativePending(
    _NativePendingSubmission turn,
    String message,
    bool Function() lease,
  ) async {
    final text = message.trim().isEmpty
        ? 'Please analyze the attached file(s).'
        : message.trim();
    bool current() =>
        lease() &&
        _repository.currentActorId == turn.actor &&
        state.storedChatId == turn.chat &&
        state.workspaceId == turn.workspace;
    if (_nativeReconciliationActive ||
        text != turn.text ||
        !listEquals(state.composerAttachments, turn.attachments)) {
      return const AssistantSubmissionOutcome.unknown();
    }
    _nativeReconciliationActive = true;
    try {
      final receipt = await _repository.reconcileNativeUserSubmission(
        actorId: turn.actor,
        wsId: turn.workspace,
        chatId: turn.chat,
        requestId: turn.requestId,
        text: turn.text,
        attachments: turn.attachments,
        isCurrent: current,
        replyToMessageId: turn.optimisticMessage?.replyToMessageId,
      );
      if (!current()) return const AssistantSubmissionOutcome.stale();
      if (receipt == null) return const AssistantSubmissionOutcome.unknown();
      final savedId = receipt.id;
      final saved = reconcileAssistantUserReceipt(
        state.messages,
        state.attachmentsByMessageId,
        requestId: turn.requestId,
        savedId: savedId,
        savedText: turn.text,
      );
      if (saved == null && state.messages.any((m) => m.id == savedId)) {
        return const AssistantSubmissionOutcome.unknown();
      }
      _nativePending.remove((turn.actor, turn.workspace, turn.chat));
      _emitIfOpen(
        state.copyWith(
          messages:
              saved?.messages
                  .map(
                    (message) => message.id == savedId
                        ? message.copyWith(
                            isPersisted: true,
                            reactions: receipt.reactions,
                            replyToMessageId: receipt.replyToMessageId,
                          )
                        : message,
                  )
                  .toList() ??
              [...state.messages, receipt],
          attachmentsByMessageId:
              saved?.attachments ??
              {
                ...state.attachmentsByMessageId,
                if (turn.attachments.isNotEmpty) savedId: turn.attachments,
              },
          composerAttachments:
              listEquals(state.composerAttachments, turn.attachments)
              ? const []
              : state.composerAttachments,
        ),
      );
      _persistAssistantChatCache();
      return AssistantSubmissionOutcome.acknowledged(turn.requestId, savedId);
    } on Object {
      return current()
          ? const AssistantSubmissionOutcome.unknown()
          : const AssistantSubmissionOutcome.stale();
    } finally {
      _nativeReconciliationActive = false;
    }
  }
}

extension _AssistantAcknowledgedSubmission on AssistantChatCubit {
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
    final retained = _nativePendingFor(wsId);
    if (retained != null) {
      if (state.replyTarget != null) {
        return const AssistantSubmissionOutcome.denied();
      }
      return await _reconcileNativePending(retained, message, current);
    }
    final selectedId = state.storedChatId;
    final previous = state.messages.reversed
        .where((m) => m.role == 'user')
        .firstOrNull;
    final legacyPending =
        selectedId != null &&
        (selectedId.startsWith('ai-chat-') ||
            selectedId.startsWith('legacy-ai-')) &&
        previous?.clientRequestId != null &&
        previous!.id == previous.clientRequestId;
    final submittedText = message.trim().isEmpty
        ? 'Please analyze the attached file(s).'
        : message.trim();
    if (legacyPending &&
        (previous.parts
                    .where((p) => p.type == 'text')
                    .map((p) => p.text ?? '')
                    .join('\n\n')
                    .trim() !=
                submittedText ||
            !listEquals(
              state.attachmentsByMessageId[previous.id] ??
                  const <AssistantAttachment>[],
              state.composerAttachments,
            ))) {
      return const AssistantSubmissionOutcome.denied();
    }
    final requestId = legacyPending
        ? previous.clientRequestId!
        : assistantClientRequestId({
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
}

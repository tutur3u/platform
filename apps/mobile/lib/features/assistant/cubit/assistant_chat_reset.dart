part of 'assistant_chat_cubit.dart';

extension AssistantChatResetOperations on AssistantChatCubit {
  Future<bool> _resetConversationBoolean(String wsId, bool informed) async =>
      (await resetConversationAcknowledged(
        wsId,
        acknowledgeUnknownCreation: informed,
      )).committedCurrent;

  Future<AssistantResetConsentTarget?> inspectResetConsentTarget(
    String wsId,
  ) async {
    final actor = _repository.currentActorId;
    final version = _workspaceVersion;
    bool current() =>
        !_closing &&
        !isClosed &&
        actor != null &&
        _repository.currentActorId == actor &&
        _preferences.matchesResetActor(actor) &&
        version == _workspaceVersion &&
        state.workspaceId == wsId;
    if (!current()) return null;
    final plan = _prepareResetWorkspaceContext?.call('personal', current);
    if (plan == null ||
        plan.actorId != actor ||
        plan.workspaceId != wsId ||
        !plan.isCurrent()) {
      return null;
    }
    bool qualified() => current() && plan.isCurrent();
    final target = await _preferences
        .resetStore(wsId, actorId: actor, isCurrent: qualified)
        .inspectResetConsentTarget();
    return qualified() ? target : null;
  }

  Future<AssistantResetOutcome> resetConversationAcknowledged(
    String wsId, {
    bool acknowledgeUnknownCreation = false,
    AssistantResetConsentTarget? consentTarget,
  }) {
    if (_resetOperations.isNotEmpty) {
      return Future.value(
        const AssistantResetOutcome(
          AssistantResetDisposition.deniedBeforeEffect,
        ),
      );
    }
    final work = _resetConversation(
      wsId,
      acknowledgeUnknownCreation: acknowledgeUnknownCreation,
      consentTarget: consentTarget,
    );
    _resetOperations.add(work);
    unawaited(
      work.then<void>(
        (_) {
          _resetOperations.remove(work);
        },
        onError: (Object error, StackTrace stackTrace) {
          // Observe tracking cleanup without creating a second escaped error.
          // The original future retains its error for the initiating caller.
          _resetOperations.remove(work);
        },
      ),
    );
    return work;
  }

  Future<AssistantResetOutcome> _resetConversation(
    String wsId, {
    required bool acknowledgeUnknownCreation,
    required AssistantResetConsentTarget? consentTarget,
  }) async {
    const denied = AssistantResetOutcome(
      AssistantResetDisposition.deniedBeforeEffect,
    );
    final prepare = _prepareResetWorkspaceContext;
    if (prepare == null) return denied;
    final actor = _repository.currentActorId;
    final version = _workspaceVersion;
    bool current() =>
        !_closing &&
        !isClosed &&
        actor != null &&
        _repository.currentActorId == actor &&
        _preferences.matchesResetActor(actor) &&
        version == _workspaceVersion &&
        state.workspaceId == wsId;
    if (!current()) return denied;
    final plan = prepare('personal', current);
    if (plan == null ||
        plan.actorId != actor ||
        plan.workspaceId != wsId ||
        !plan.isCurrent()) {
      return denied;
    }
    bool qualified() => current() && plan.isCurrent();
    final store = _preferences.resetStore(
      wsId,
      actorId: actor,
      isCurrent: qualified,
    );
    final operationId = _repository.generateUuid();
    final outcome = await store.reset(
      operationId,
      informed: acknowledgeUnknownCreation,
      consentTarget: consentTarget,
    );
    if (!outcome.committedCurrent) {
      if (qualified() &&
          outcome.disposition != AssistantResetDisposition.deniedBeforeEffect) {
        _emitIfOpen(state.copyWith(creationOutcomeUnknown: true));
      }
      return outcome;
    }
    // Everything below follows a known whole-tuple host receipt. No async
    // notification can veto the commit or compensate a different actor.
    if (!qualified() || !plan.publishCurrent()) {
      store.hold();
      return const AssistantResetOutcome(
        AssistantResetDisposition.committedStale,
      );
    }
    _workspaceVersion++;
    _repository.invalidateChatCreation(retainResetConsent: true);
    _queueDebounce?.cancel();
    _queueDebounce = null;
    for (final request in _submissionAcks.keys) {
      if (request == _activeSubmissionRequestId) {
        _unknownSubmission(request);
      } else {
        _staleSubmission(request);
      }
    }
    _queuedSubmissionEntry = null;
    _queuedSubmissionRequestId = null;
    _activeSubmissionRequestId = null;
    _queue.clear();
    final subscription = _streamSubscription;
    _streamSubscription = null;
    final committedVersion = _workspaceVersion;
    _emitIfOpen(
      state.copyWith(
        status: AssistantChatStatus.idle,
        creationOutcomeUnknown: false,
        chat: null,
        storedChatId: null,
        replyTarget: null,
        reactionResult: null,
        messages: const [],
        attachmentsByMessageId: const {},
        composerAttachments: const [],
        fallbackChatId: _repository.generateUuid(),
        queuedMessages: const [],
      ),
    );
    Future<void> observe(Future<void> Function() work) async {
      try {
        await work();
      } on Object catch (error) {
        if (!isClosed && committedVersion == _workspaceVersion) {
          _operationalReporter.report(OperationalPhase.assistantReply, error);
        }
      }
    }

    // These futures are observed and included in close's owned cleanup drain.
    late Future<void> notification;
    notification = observe(() async {
      _publishRestoredSettings(null);
      await _onChatRestored(null);
    }).whenComplete(() => _submissionObserverCleanups.remove(notification));
    _submissionObserverCleanups.add(notification);
    if (subscription != null) {
      late Future<void> cleanup;
      cleanup = observe(
        subscription.cancel,
      ).whenComplete(() => _submissionObserverCleanups.remove(cleanup));
      _submissionObserverCleanups.add(cleanup);
    }
    return outcome;
  }
}

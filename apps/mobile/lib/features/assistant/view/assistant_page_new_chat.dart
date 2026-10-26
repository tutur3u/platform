part of 'assistant_page.dart';

enum _AssistantNewChatResult { retained, committed, committedCleanupFailed }

extension _AssistantPageNewChat on _AssistantPageState {
  Future<void> _showNewChatResetNotice(
    String message, {
    BuildContext? historyContext,
  }) async {
    final scope = _localScope();
    final version = _localCubit.scopeVersion;
    final wsId = _loadedWorkspaceId;
    final inspect = await showAssistantNewChatResetStatus(
      context,
      message: message,
    );
    if (!mounted ||
        scope != _localScope() ||
        version != _localCubit.scopeVersion ||
        wsId == null) {
      return;
    }
    if (inspect) {
      if (historyContext?.mounted ?? false) {
        await _chatCubit.refreshHistory();
      } else {
        await _showHistorySheet(context, wsId);
      }
    }
  }

  Future<_AssistantNewChatResult> _startNewConversation(
    String wsId,
    AssistantChatState chatState,
    AssistantLiveState liveState, {
    BuildContext? historyContext,
    bool preserveDraft = false,
  }) async {
    if (_localCubit.state.local || _localCubit.state.blocked) {
      _dismissKeyboard();
      _inputController.clear();
      await _localCubit.clearConversation();
      if (mounted) _scheduleScrollToTop();
      return _AssistantNewChatResult.committed;
    }
    if (_newConversationPending) return _AssistantNewChatResult.retained;
    final scope = _localScope();
    final version = _localCubit.scopeVersion;
    final draft = _inputController.value;
    final l10n = context.l10n;
    var draftRevision = 0;
    bool Function()? acknowledgedCurrent;
    StreamSubscription<AssistantChatState>? selectionSubscription;
    StreamSubscription<AssistantShellState>? contextSubscription;
    void changed() => draftRevision++;
    bool originCurrent() =>
        mounted &&
        scope != null &&
        scope == _localScope() &&
        version == _localCubit.scopeVersion &&
        _loadedWorkspaceId == wsId &&
        _chatCubit.state.workspaceId == wsId &&
        !_localCubit.state.local &&
        !_localCubit.state.blocked;
    bool current() =>
        originCurrent() &&
        draftRevision == 0 &&
        (acknowledgedCurrent?.call() ?? true);
    if (!mounted || !current()) return _AssistantNewChatResult.retained;
    _newConversationPending = true;
    _newConversationCurrent = current;
    _inputController.addListener(changed);
    var committed = false;
    Future<void> notice(String message) async {
      if (originCurrent()) {
        await _showNewChatResetNotice(message, historyContext: historyContext);
      }
    }

    try {
      final target = await _chatCubit.inspectResetConsentTarget(wsId);
      final selected = _chatCubit.state.storedChatId;
      final contextId = _shellCubit.state.workspaceContextId;
      if (!mounted || !current()) {
        await notice(l10n.assistantNewChatResetStale);
        return _AssistantNewChatResult.retained;
      }
      if (target == null) {
        await notice(l10n.assistantNewChatResetUncertain);
        return _AssistantNewChatResult.retained;
      }
      if (target.requiresConsent) {
        final decision = await showAssistantNewChatConfirmation(context);
        if (!mounted || !current()) {
          await notice(l10n.assistantNewChatResetStale);
          return _AssistantNewChatResult.retained;
        }
        if (decision == AssistantNewChatDecision.inspectHistory) {
          if (historyContext?.mounted ?? false) {
            await _chatCubit.refreshHistory();
          } else {
            await _showHistorySheet(context, wsId);
          }
          return _AssistantNewChatResult.retained;
        }
        if (decision != AssistantNewChatDecision.createNew) {
          return _AssistantNewChatResult.retained;
        }
      }
      if (!current() ||
          selected != _chatCubit.state.storedChatId ||
          contextId != _shellCubit.state.workspaceContextId) {
        await notice(l10n.assistantNewChatResetStale);
        return _AssistantNewChatResult.retained;
      }
      final outcome = await _chatCubit.resetConversationAcknowledged(
        wsId,
        consentTarget: target.requiresConsent ? target : null,
      );
      switch (outcome.disposition) {
        case AssistantResetDisposition.deniedBeforeEffect:
          await notice(l10n.assistantNewChatResetDenied);
          return _AssistantNewChatResult.retained;
        case AssistantResetDisposition.uncertain:
          await notice(l10n.assistantNewChatResetUncertain);
          return _AssistantNewChatResult.retained;
        case AssistantResetDisposition.committedStale:
          await notice(l10n.assistantNewChatResetCommittedStale);
          return _AssistantNewChatResult.retained;
        case AssistantResetDisposition.committedCurrent:
          committed = true;
      }
      final acknowledgedContext = _shellCubit.state.workspaceContextId;
      final acknowledgedFallback = _chatCubit.state.fallbackChatId;
      var conversationChanged = acknowledgedContext != 'personal';
      bool sameSelection(AssistantChatState state) =>
          state.workspaceId == wsId &&
          state.status == AssistantChatStatus.idle &&
          state.storedChatId == null &&
          state.chat == null &&
          state.fallbackChatId == acknowledgedFallback;
      acknowledgedCurrent = () =>
          !conversationChanged &&
          sameSelection(_chatCubit.state) &&
          _shellCubit.state.workspaceContextId == acknowledgedContext;
      // An observed transition permanently invalidates this acknowledged lease.
      // Returning to the earlier selection/context cannot revive its cleanup.
      selectionSubscription = _chatCubit.stream.listen((state) {
        if (!sameSelection(state)) conversationChanged = true;
      });
      contextSubscription = _shellCubit.stream.listen((state) {
        if (state.workspaceContextId != acknowledgedContext) {
          conversationChanged = true;
        }
      });
      if (!mounted || !current()) {
        await notice(l10n.assistantNewChatResetCommittedStale);
        return _AssistantNewChatResult.retained;
      }
      if (_isVisibleLiveSession(chatState, liveState) ||
          context.read<AssistantChromeCubit>().state.isLiveMode) {
        await _liveCubit.disconnect(
          clearSession: true,
          reportSessionCleanupFailure: true,
        );
      }
      if (!mounted || !current()) {
        await notice(l10n.assistantNewChatResetCommittedStale);
        return _AssistantNewChatResult.retained;
      }
      context.read<AssistantChromeCubit>().exitLiveMode();
      _inputController.removeListener(changed);
      if (!preserveDraft && _inputController.value == draft) {
        _dismissKeyboard();
        _inputController.clear();
      }
      _scheduleScrollToTop();
      return _AssistantNewChatResult.committed;
    } on Object {
      await notice(
        committed
            ? l10n.assistantNewChatResetCleanupFailed
            : l10n.assistantNewChatResetUncertain,
      );
      return committed
          ? _AssistantNewChatResult.committedCleanupFailed
          : _AssistantNewChatResult.retained;
    } finally {
      unawaited(selectionSubscription?.cancel());
      unawaited(contextSubscription?.cancel());
      _inputController.removeListener(changed);
      _newConversationCurrent = null;
      _newConversationPending = false;
    }
  }
}

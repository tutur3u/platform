part of 'assistant_page.dart';

const _launchReadyTimeout = Duration(seconds: 20);

/// Consumes Siri/Shortcuts and launcher requests published by
/// [AssistantLaunchCoordinator]. Requests are claimed once, scoped to the
/// signed-in actor and the loaded workspace, and Live starts only through the
/// existing [_enterLiveMode] start gate so repeated triggers reuse a session.
extension _AssistantPageLaunch on _AssistantPageState {
  void _scheduleLaunchDrain() {
    if (_launchCoordinator.request.value == null) return;
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => unawaited(_drainLaunchRequest()),
    );
  }

  Future<void> _drainLaunchRequest() async {
    final request = _launchCoordinator.request.value;
    final wsId = _loadedWorkspaceId;
    if (request == null ||
        wsId == null ||
        !mounted ||
        !TickerMode.valuesOf(context).enabled) {
      return;
    }
    if (!_launchCoordinator.claim(request, actorId: _currentActor())) return;
    final epoch = _voiceActorScopeEpoch;
    bool current() =>
        mounted && epoch == _voiceActorScopeEpoch && _loadedWorkspaceId == wsId;
    if (!await _awaitLaunchReady(wsId) || !current()) return;
    final action = request.action;
    switch (action.kind) {
      case AssistantLaunchKind.voice:
        await _launchVoice(wsId, action, current);
      case AssistantLaunchKind.prompt:
        await _launchPrompt(wsId, action);
    }
  }

  Future<bool> _awaitLaunchReady(String wsId) async {
    bool shellReady(AssistantShellState state) =>
        state.workspace?.id == wsId &&
        (state.status == AssistantShellStatus.loaded ||
            state.status == AssistantShellStatus.error);
    bool chatReady(AssistantChatState state) =>
        state.workspaceId == wsId &&
        state.status != AssistantChatStatus.restoring &&
        (state.hasLoadedOnce || state.error != null);
    try {
      if (!shellReady(_shellCubit.state)) {
        await _shellCubit.stream
            .firstWhere(shellReady)
            .timeout(_launchReadyTimeout);
      }
      if (!chatReady(_chatCubit.state)) {
        await _chatCubit.stream
            .firstWhere(chatReady)
            .timeout(_launchReadyTimeout);
      }
    } on Object {
      // Timeout or a closed cubit: fall through to the readiness check.
    }
    return _shellCubit.state.workspace?.id == wsId &&
        _shellCubit.state.status == AssistantShellStatus.loaded;
  }

  Future<void> _launchVoice(
    String wsId,
    AssistantLaunchAction action,
    bool Function() current,
  ) async {
    if (_localCubit.state.local || _localCubit.state.blocked) {
      _showInlineNotice(context.l10n.assistantLocalTextOnly);
      return;
    }
    if (!_hasLiveAccess(_shellCubit.state)) {
      // Shows the blocked-reason sheet instead of failing silently.
      await _handleMicrophoneTap(wsId);
      return;
    }
    if (!action.trusted) {
      final confirmed = await showAssistantLaunchVoiceConfirmation(
        context,
        assistantName: _shellCubit.state.soul.name,
      );
      if (!confirmed || !current()) return;
    }
    final chatState = _chatCubit.state;
    await _enterLiveMode(
      wsId: wsId,
      activeChatId: chatState.chat?.id ?? chatState.storedChatId,
      autoStartMicrophone: true,
    );
  }

  Future<void> _launchPrompt(String wsId, AssistantLaunchAction action) async {
    final prompt = action.prompt;
    if (prompt != null) {
      _inputController.value = TextEditingValue(
        text: prompt,
        selection: TextSelection.collapsed(offset: prompt.length),
      );
    }
    final liveMode = context.read<AssistantChromeCubit>().state.isLiveMode;
    // Never interrupt an active call to show the composer.
    if (!liveMode) _restoreComposerAndFocus();
    if (!action.autoSendPrompt) return;
    await _handleSend(
      wsId,
      _shellCubit.state,
      _chatCubit.state,
      _liveCubit.state,
    );
  }
}

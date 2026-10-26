part of 'assistant_page.dart';

extension _AssistantPageSettings on _AssistantPageState {
  void _settingsSelectionFailed(AssistantSettingsDisposition result) {
    if (!mounted) return;
    final message = result == AssistantSettingsDisposition.denied
        ? context.l10n.assistantSettingsSelectionDenied
        : context.l10n.assistantSettingsSelectionUnconfirmed;
    showAppToast(context, message: message);
  }

  Future<AssistantSettingsDisposition> _selectRemoteSettings(
    AssistantSettingsSelection selection,
    bool Function() selectionCurrent,
  ) async {
    final wsId = _loadedWorkspaceId;
    final actor = _currentActor();
    final scope = _localScope();
    final version = _chatCubit.attachmentScopeVersion;
    final chatId = _chatCubit.state.storedChatId;
    final guard = wsId == null ? null : _remoteOperationGuard(wsId);
    bool current() =>
        mounted &&
        actor != null &&
        scope != null &&
        _currentActor() == actor &&
        _repository.currentActorId == actor &&
        _localScope() == scope &&
        (guard?.current ?? false) &&
        _chatCubit.attachmentScopeVersion == version &&
        _chatCubit.state.storedChatId == chatId &&
        selectionCurrent();
    if (!current()) return AssistantSettingsDisposition.stale;
    if (_settingsWritePending) return AssistantSettingsDisposition.denied;
    // An empty chat holds a local intent for the atomic creation receipt.
    if (chatId == null) return AssistantSettingsDisposition.deferred;
    _settingsWritePending = true;
    try {
      return await _repository.acknowledgeSettingsSelection(
        actorId: actor!,
        wsId: wsId!,
        chatId: chatId,
        selection: selection,
        isCurrent: current,
      );
    } finally {
      _settingsWritePending = false;
    }
  }

  AssistantCreationSettingsPlan? _prepareCreationSettings(
    String wsId,
    String modelId,
    bool Function() creationCurrent,
  ) {
    final shell = _shellCubit.state;
    final actor = _currentActor();
    final scope = _localScope();
    final version = _chatCubit.attachmentScopeVersion;
    final revision = _shellCubit.settingsRevision;
    final guard = _remoteOperationGuard(wsId);
    final creditWsId = shell.creditSource == AssistantCreditSource.personal
        ? shell.personalWorkspaceId
        : wsId;
    bool current() =>
        mounted &&
        actor != null &&
        scope != null &&
        _currentActor() == actor &&
        _repository.currentActorId == actor &&
        _localScope() == scope &&
        guard.current &&
        creationCurrent() &&
        _chatCubit.attachmentScopeVersion == version &&
        _shellCubit.settingsRevision == revision &&
        !_shellCubit.settingsSelectionPending;
    if (!current() ||
        creditWsId == null ||
        shell.selectedModel.value != modelId) {
      return null;
    }
    return AssistantCreationSettingsPlan(
      ChatInitialAiSettings(
        modelId: modelId,
        creditSource: shell.creditSource.name,
        creditWsId: creditWsId,
        thinkingMode: shell.thinkingMode.name,
      ),
      current,
    );
  }
}

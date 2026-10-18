part of 'assistant_shell_cubit.dart';

extension _AssistantShellSettings on AssistantShellCubit {
  bool Function() _settingsLease() {
    final revision = ++_settingsRequestVersion;
    final workspaceVersion = _requestVersion;
    final actor = _repository.currentActorId;
    final scope = _currentScopeToken?.call();
    final settingsToken = _currentSettingsToken?.call();
    return () =>
        !isClosed &&
        revision == _settingsRequestVersion &&
        workspaceVersion == _requestVersion &&
        _repository.currentActorId == actor &&
        _currentScopeToken?.call() == scope &&
        _currentSettingsToken?.call() == settingsToken;
  }

  Future<bool> _acceptSettings(
    AssistantSettingsSelection selection,
    bool Function() current,
  ) async {
    if (!current()) return false;
    final result =
        await _selectSettings?.call(selection, current) ??
        AssistantSettingsDisposition.deferred;
    if (!current()) return false;
    if (result == AssistantSettingsDisposition.acknowledged ||
        result == AssistantSettingsDisposition.deferred) {
      return true;
    }
    _onSettingsSelectionFailure?.call(result);
    return false;
  }

  Future<bool> _selectModel(AssistantGatewayModel model) async {
    final workspace = state.workspace;
    if (workspace == null || _settingsSelectionPending) return false;
    final creditWsId = state.creditSource == AssistantCreditSource.personal
        ? state.personalWorkspaceId
        : workspace.id;
    if (creditWsId == null) return false;
    final current = _settingsLease();
    _settingsSelectionPending = true;
    try {
      final selection = AssistantSettingsSelection(
        modelId: model.value,
        creditSource: state.creditSource,
        creditWsId: creditWsId,
        thinkingMode: state.thinkingMode,
      );
      if (!await _acceptSettings(selection, current)) return false;
      await _preferences.saveModel(workspace.id, model, shouldWrite: current);
      if (!current()) return false;
      _emitIfOpen(
        state.copyWith(selectedModel: model, conversationSettings: null),
      );
      return true;
    } on Object {
      if (current()) {
        _onSettingsSelectionFailure?.call(AssistantSettingsDisposition.unknown);
      }
      return false;
    } finally {
      _settingsSelectionPending = false;
    }
  }

  Future<bool> _selectCreditSource(AssistantCreditSource source) async {
    final workspace = state.workspace;
    if (workspace == null || _settingsSelectionPending) return false;
    final effective = state.workspaceCreditLocked
        ? AssistantCreditSource.personal
        : source;
    final creditWsId = effective == AssistantCreditSource.personal
        ? state.personalWorkspaceId
        : workspace.id;
    if (creditWsId == null) return false;
    final current = _settingsLease();
    _settingsSelectionPending = true;
    try {
      final credits = await _repository.fetchCredits(creditWsId);
      if (!current()) return false;
      final model = _resolveSelectedModel(
        state.availableModels,
        state.selectedModel,
        credits.defaultLanguageModel ?? _defaultAssistantModel.value,
        credits,
      );
      if (!await _acceptSettings(
        AssistantSettingsSelection(
          modelId: model.value,
          creditSource: effective,
          creditWsId: creditWsId,
          thinkingMode: state.thinkingMode,
        ),
        current,
      )) {
        return false;
      }
      await _preferences.saveCreditSource(
        workspace.id,
        effective,
        shouldWrite: current,
      );
      await _preferences.saveModel(workspace.id, model, shouldWrite: current);
      if (!current()) return false;
      _emitIfOpen(
        state.copyWith(
          status: AssistantShellStatus.loaded,
          creditSource: effective,
          personalCredits: effective == AssistantCreditSource.personal
              ? credits
              : state.personalCredits,
          workspaceCredits: effective == AssistantCreditSource.workspace
              ? credits
              : state.workspaceCredits,
          activeCredits: credits,
          selectedModel: model,
          conversationSettings: null,
        ),
      );
      return true;
    } on Object {
      if (current()) {
        _emitIfOpen(state.copyWith(status: AssistantShellStatus.error));
        _onSettingsSelectionFailure?.call(AssistantSettingsDisposition.unknown);
      }
      return false;
    } finally {
      _settingsSelectionPending = false;
    }
  }
}

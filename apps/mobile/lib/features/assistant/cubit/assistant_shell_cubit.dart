// Assistant feature parity module: targeted lint suppressions keep the shell
// state wiring readable.
// ignore_for_file: always_use_package_imports, lines_longer_than_80_chars, avoid_positional_boolean_parameters

import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/workspace.dart';

import '../data/assistant_preferences.dart';
import '../data/assistant_repository.dart';
import '../models/assistant_models.dart';

part 'assistant_shell_state.dart';

const _defaultAssistantModel = AssistantGatewayModel(
  value: 'google/gemini-3.1-flash-lite-preview',
  label: 'gemini-3.1-flash-lite-preview',
  provider: 'google',
);

class AssistantShellCubit extends Cubit<AssistantShellState> {
  AssistantShellCubit({
    required AssistantRepository repository,
    required AssistantPreferences preferences,
  }) : _repository = repository,
       _preferences = preferences,
       super(const AssistantShellState());

  final AssistantRepository _repository;
  final AssistantPreferences _preferences;
  int _requestVersion = 0;
  int _insightsRequestVersion = 0;

  void _emitIfOpen(AssistantShellState nextState) {
    if (isClosed) {
      return;
    }
    emit(nextState);
  }

  Future<void> loadWorkspace(Workspace workspace) async {
    final requestVersion = ++_requestVersion;
    _emitIfOpen(
      state.copyWith(
        status: AssistantShellStatus.loading,
        workspace: workspace,
        clearError: true,
      ),
    );

    try {
      final storedModel = await _preferences.loadModel(workspace.id);
      final storedThinkingMode =
          await _preferences.loadThinkingMode(workspace.id) ??
          AssistantThinkingMode.fast;
      final storedCreditSource =
          await _preferences.loadCreditSource(workspace.id) ??
          AssistantCreditSource.workspace;
      final storedWorkspaceContext =
          await _preferences.loadWorkspaceContextId(workspace.id) ?? 'personal';

      final personalWorkspaceFuture = _repository.resolvePersonalWorkspaceId();
      final soulFuture = _repository.fetchSoul();
      final tasksFuture = _repository.fetchTasksInsight(
        wsId: workspace.id,
        isPersonal: workspace.personal,
      );
      final calendarFuture = _repository.fetchCalendarInsight(workspace.id);
      final workspaceCreditsFuture = _repository.fetchCredits(workspace.id);
      final modelsFuture = _repository.fetchGatewayModels();

      final personalWorkspaceId = await personalWorkspaceFuture;
      final soul = await soulFuture;
      final tasks = await tasksFuture;
      final calendar = await calendarFuture;
      final workspaceCredits = await workspaceCreditsFuture;
      final models = await modelsFuture;

      if (isClosed || requestVersion != _requestVersion) return;

      final isPersonalDashboardWorkspace =
          personalWorkspaceId != null && personalWorkspaceId == workspace.id;
      final workspaceCreditLocked =
          isPersonalDashboardWorkspace || workspaceCredits.tier == 'FREE';
      final activeCreditSource = workspaceCreditLocked
          ? AssistantCreditSource.personal
          : storedCreditSource;
      final creditWorkspaceId =
          activeCreditSource == AssistantCreditSource.personal
          ? personalWorkspaceId
          : workspace.id;
      final activeCredits = creditWorkspaceId == null
          ? workspaceCredits
          : await _repository.fetchCredits(creditWorkspaceId);

      if (isClosed || requestVersion != _requestVersion) return;

      final defaultModelId =
          activeCredits.defaultLanguageModel ?? _defaultAssistantModel.value;
      final selectedModel = _resolveSelectedModel(
        models,
        storedModel,
        defaultModelId,
        activeCredits,
      );

      _emitIfOpen(
        state.copyWith(
          status: AssistantShellStatus.loaded,
          workspace: workspace,
          soul: soul,
          personalWorkspaceId: personalWorkspaceId,
          tasksInsight: tasks,
          calendarInsight: calendar,
          workspaceCredits: workspaceCredits,
          activeCredits: activeCredits,
          availableModels: models,
          selectedModel: selectedModel,
          thinkingMode: storedThinkingMode,
          creditSource: activeCreditSource,
          workspaceContextId: storedWorkspaceContext,
          workspaceCreditLocked: workspaceCreditLocked,
          isPersonalDashboardWorkspace: isPersonalDashboardWorkspace,
        ),
      );

      unawaited(_preferences.saveModel(workspace.id, selectedModel));
      unawaited(
        _preferences.saveThinkingMode(workspace.id, storedThinkingMode),
      );
      unawaited(
        _preferences.saveCreditSource(workspace.id, activeCreditSource),
      );
      unawaited(
        _preferences.saveWorkspaceContextId(
          workspace.id,
          storedWorkspaceContext,
        ),
      );
    } on Exception catch (error) {
      if (isClosed || requestVersion != _requestVersion) return;
      _emitIfOpen(
        state.copyWith(
          status: AssistantShellStatus.error,
          error: error.toString(),
        ),
      );
    }
  }

  Future<void> renameAssistant(String name) async {
    if (state.workspace == null) return;
    final soul = await _repository.updateSoulName(name);
    if (isClosed) return;
    emit(state.copyWith(soul: soul));
  }

  Future<void> refreshSoul() async {
    final soul = await _repository.fetchSoul();
    if (isClosed) return;
    emit(state.copyWith(soul: soul));
  }

  Future<void> setSelectedModel(AssistantGatewayModel model) async {
    final workspace = state.workspace;
    if (workspace == null) return;
    emit(state.copyWith(selectedModel: model));
    await _preferences.saveModel(workspace.id, model);
  }

  Future<void> setThinkingMode(AssistantThinkingMode mode) async {
    final workspace = state.workspace;
    if (workspace == null) return;
    emit(state.copyWith(thinkingMode: mode));
    await _preferences.saveThinkingMode(workspace.id, mode);
  }

  Future<void> setCreditSource(AssistantCreditSource source) async {
    final workspace = state.workspace;
    if (workspace == null) return;

    final effectiveSource = state.workspaceCreditLocked
        ? AssistantCreditSource.personal
        : source;
    final creditWorkspaceId = effectiveSource == AssistantCreditSource.personal
        ? state.personalWorkspaceId
        : workspace.id;
    if (creditWorkspaceId == null) return;

    final activeCredits = await _repository.fetchCredits(creditWorkspaceId);
    final selectedModel = _resolveSelectedModel(
      state.availableModels,
      state.selectedModel,
      activeCredits.defaultLanguageModel ?? _defaultAssistantModel.value,
      activeCredits,
    );

    emit(
      state.copyWith(
        creditSource: effectiveSource,
        activeCredits: activeCredits,
        selectedModel: selectedModel,
      ),
    );

    await _preferences.saveCreditSource(workspace.id, effectiveSource);
    await _preferences.saveModel(workspace.id, selectedModel);
  }

  Future<void> setWorkspaceContextId(String contextId) async {
    final workspace = state.workspace;
    if (workspace == null) return;
    emit(state.copyWith(workspaceContextId: contextId));
    await _preferences.saveWorkspaceContextId(workspace.id, contextId);
  }

  void setImmersiveMode(bool value) {
    emit(state.copyWith(isImmersive: value));
  }

  void setViewOnly(bool value) {
    emit(state.copyWith(isViewOnly: value));
  }

  Future<void> refreshInsights() async {
    final workspace = state.workspace;
    if (workspace == null) return;
    final requestVersion = ++_insightsRequestVersion;
    final workspaceId = workspace.id;

    final tasks = await _repository.fetchTasksInsight(
      wsId: workspaceId,
      isPersonal: workspace.personal,
    );

    if (isClosed || requestVersion != _insightsRequestVersion) return;
    if (state.workspace?.id != workspaceId) return;

    final calendar = await _repository.fetchCalendarInsight(workspaceId);

    if (isClosed || requestVersion != _insightsRequestVersion) return;
    if (state.workspace?.id != workspaceId) return;

    _emitIfOpen(
      state.copyWith(
        tasksInsight: tasks,
        calendarInsight: calendar,
      ),
    );
  }

  AssistantGatewayModel _resolveSelectedModel(
    List<AssistantGatewayModel> models,
    AssistantGatewayModel? preferred,
    String defaultModelId,
    AssistantCredits credits,
  ) {
    AssistantGatewayModel? findById(String modelId) {
      for (final model in models) {
        if (model.value == modelId) return model;
      }
      return null;
    }

    bool matchesAllowedModel(String modelId) {
      if (credits.allowedModels.isEmpty) return true;
      return credits.allowedModels.any((allowed) {
        if (allowed == modelId) return true;
        final bare = modelId.contains('/') ? modelId.split('/').last : modelId;
        return allowed == bare;
      });
    }

    final candidate =
        preferred ?? findById(defaultModelId) ?? _defaultAssistantModel;
    if (matchesAllowedModel(candidate.value)) {
      return findById(candidate.value) ?? candidate;
    }

    final allowedDefault = findById(defaultModelId);
    if (allowedDefault != null) {
      return allowedDefault;
    }

    final firstAllowed = models.cast<AssistantGatewayModel?>().firstWhere(
      (model) => model != null && matchesAllowedModel(model.value),
      orElse: () => null,
    );
    return firstAllowed ?? _defaultAssistantModel;
  }
}

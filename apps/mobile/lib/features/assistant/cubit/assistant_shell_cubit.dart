// Assistant feature parity module: targeted lint suppressions keep the shell
// state wiring readable.
// ignore_for_file: always_use_package_imports

import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/workspace.dart';

import '../data/assistant_preferences.dart';
import '../data/assistant_repository.dart';
import '../data/assistant_reset_preferences.dart';
import '../data/assistant_settings_selection.dart';
import '../models/assistant_model_eligibility.dart';
import '../models/assistant_models.dart';
import '../models/assistant_soul_snapshot.dart';

part 'assistant_shell_state.dart';
part 'assistant_shell_settings.dart';

const _defaultAssistantModel = AssistantGatewayModel(
  value: 'google/gemini-3.1-flash-lite',
  label: 'gemini-3.1-flash-lite',
  provider: 'google',
);

class AssistantShellCubit extends Cubit<AssistantShellState> {
  AssistantShellCubit({
    required AssistantRepository repository,
    required AssistantPreferences preferences,
    Object? Function()? currentScopeToken,
    AssistantSettingsSelector? selectSettings,
    Object? Function()? currentSettingsToken,
    void Function(AssistantSettingsDisposition)? onSettingsSelectionFailure,
    this.selectionSettleWait = const Duration(seconds: 3),
  }) : _repository = repository,
       _preferences = preferences,
       _currentScopeToken = currentScopeToken,
       _selectSettings = selectSettings,
       _currentSettingsToken = currentSettingsToken,
       _onSettingsSelectionFailure = onSettingsSelectionFailure,
       super(const AssistantShellState());

  final AssistantRepository _repository;
  final AssistantPreferences _preferences;
  final Object? Function()? _currentScopeToken;
  final AssistantSettingsSelector? _selectSettings;

  /// The response mode chosen in this workspace session. An opened
  /// conversation shows and sends with its stored mode, which the native
  /// message endpoint requires; new chats use this one.
  AssistantThinkingMode _sessionThinkingMode = AssistantThinkingMode.fast;

  /// The open conversation's stored settings, kept apart from [state] so a
  /// workspace load that finishes after the conversation restores keeps
  /// them: native sends require them.
  ({
    String? actorId,
    String workspaceId,
    AssistantConversationSettings settings,
  })?
  _openConversation;

  /// The (actor, workspace) whose session the mode and open conversation
  /// belong to; a change of either starts a new session.
  ({String? actorId, String workspaceId})? _sessionScope;

  /// Advances with each new session, so a settings change started in one
  /// never lands in another, including after a switch away and back.
  int _scopeEpoch = 0;

  /// The settings change in flight and the session it belongs to; a load of
  /// that session waits for it.
  ({int epoch, Future<void> done})? _pendingSelection;

  /// Counts applied settings changes, so a load knows one landed meanwhile.
  int _appliedSelections = 0;

  /// Whether the current session's first load has emitted its settings.
  /// Settings changes wait for it, so none is built from the previous
  /// session's model or credit source.
  bool _sessionLoaded = false;

  /// Longest a workspace load waits for a settings change still being saved
  /// before it emits; a change that settles later still applies itself.
  final Duration selectionSettleWait;

  /// Whether a settings change may start now.
  bool get _acceptsSettingsChanges => _sessionLoaded;
  final Object? Function()? _currentSettingsToken;
  final void Function(AssistantSettingsDisposition)?
  _onSettingsSelectionFailure;
  int _settingsRequestVersion = 0;
  bool _settingsSelectionPending = false;
  int get settingsRevision => _settingsRequestVersion;
  bool get settingsSelectionPending => _settingsSelectionPending;
  int _soulRefreshGeneration = 0;
  int _requestVersion = 0;
  int _publicContextRequestEpoch = 0;
  int _insightsRequestVersion = 0;

  void _emitIfOpen(AssistantShellState nextState) {
    if (isClosed) {
      return;
    }
    emit(nextState);
  }

  Future<void> loadWorkspace(
    Workspace workspace, {
    bool forceRefresh = false,
  }) async {
    final requestVersion = ++_requestVersion;
    // Every session (actor and workspace) starts at Fast, as on web,
    // ignoring any stored mode; only an explicit choice in this session
    // changes it. Refreshing the same workspace keeps that choice.
    final scope = (
      actorId: _repository.currentActorId,
      workspaceId: workspace.id,
    );
    final newSession = scope != _sessionScope;
    if (newSession) {
      _sessionScope = scope;
      _scopeEpoch++;
      _sessionLoaded = false;
      _sessionThinkingMode = AssistantThinkingMode.fast;
      _openConversation = null;
    }
    final appliedAtStart = _appliedSelections;
    _emitIfOpen(
      state.copyWith(
        status: AssistantShellStatus.loading,
        workspace: workspace,
        clearError: true,
      ),
    );

    try {
      final storedModel = await _preferences.loadModel(workspace.id);
      final storedCreditSource =
          await _preferences.loadCreditSource(workspace.id) ??
          AssistantCreditSource.workspace;
      final storedWorkspaceContext =
          await _preferences.loadWorkspaceContextId(workspace.id) ?? 'personal';

      // Insights are optional; a missing Calendar/Tasks endpoint must not
      // replace a paid workspace's balance and model selection with defaults.
      // Attach handlers together so a parallel failure never escapes the zone.
      final results = await Future.wait<Object?>([
        _repository.resolvePersonalWorkspaceId(),
        _optional(_repository.fetchSoul(), const AssistantSoul()),
        _optional(
          _repository.fetchTasksInsight(
            wsId: workspace.id,
            isPersonal: workspace.personal,
          ),
          const AssistantTasksInsight(),
        ),
        _optional(
          _repository.fetchCalendarInsight(workspace.id),
          const AssistantCalendarInsight(),
        ),
        _repository.fetchCredits(workspace.id, forceRefresh: forceRefresh),
        _optional(_repository.fetchGatewayModels(), <AssistantGatewayModel>[]),
      ]);
      final personalWorkspaceId = results[0] as String?;
      final soul = results[1]! as AssistantSoul;
      final tasks = results[2]! as AssistantTasksInsight;
      final calendar = results[3]! as AssistantCalendarInsight;
      final workspaceCredits = results[4]! as AssistantCredits;
      final models = results[5]! as List<AssistantGatewayModel>;
      final personalCredits = personalWorkspaceId == null
          ? const AssistantCredits()
          : personalWorkspaceId == workspace.id
          ? workspaceCredits
          : await _repository.fetchCredits(
              personalWorkspaceId,
              forceRefresh: forceRefresh,
            );

      if (isClosed || requestVersion != _requestVersion) return;

      final isPersonalDashboardWorkspace =
          personalWorkspaceId != null && personalWorkspaceId == workspace.id;
      final workspaceCreditLocked =
          isPersonalDashboardWorkspace || workspaceCredits.tier == 'FREE';
      final activeCreditSource = workspaceCreditLocked
          ? AssistantCreditSource.personal
          : storedCreditSource;
      final activeCredits = activeCreditSource == AssistantCreditSource.personal
          ? (personalWorkspaceId == null ? workspaceCredits : personalCredits)
          : workspaceCredits;

      if (isClosed || requestVersion != _requestVersion) return;

      final defaultModelId =
          activeCredits.defaultLanguageModel ?? _defaultAssistantModel.value;
      final selectedModel = _resolveSelectedModel(
        models,
        storedModel,
        defaultModelId,
        activeCredits,
      );

      // A settings change in flight wins over this load's view of them.
      final pending = _pendingSelection;
      if (pending != null && pending.epoch == _scopeEpoch) {
        await pending.done.timeout(selectionSettleWait, onTimeout: () {});
        if (isClosed || requestVersion != _requestVersion) return;
      }
      // Only a change within this same session can win; a new session's
      // first load always applies its own settings.
      final changed = !newSession && _appliedSelections != appliedAtStart;
      final open = _openConversationFor(workspace.id);
      final creditSource = changed
          ? state.creditSource
          : open?.creditSource ?? activeCreditSource;
      _emitIfOpen(
        state.copyWith(
          status: AssistantShellStatus.loaded,
          workspace: workspace,
          soul: soul,
          personalWorkspaceId: personalWorkspaceId,
          tasksInsight: tasks,
          calendarInsight: calendar,
          workspaceCredits: workspaceCredits,
          personalCredits: personalCredits,
          activeCredits: changed && creditSource != activeCreditSource
              ? state.activeCredits
              : activeCredits,
          availableModels: models,
          selectedModel: changed
              ? state.selectedModel
              : open == null
              ? selectedModel
              : _conversationModel(open, models),
          thinkingMode: changed
              ? state.thinkingMode
              : open?.thinkingMode ?? _sessionThinkingMode,
          conversationSettings: changed ? state.conversationSettings : open,
          creditSource: creditSource,
          workspaceContextId: storedWorkspaceContext,
          workspaceCreditLocked: workspaceCreditLocked,
          isPersonalDashboardWorkspace: isPersonalDashboardWorkspace,
        ),
      );

      _sessionLoaded = true;
      if (!changed) {
        unawaited(_preferences.saveModel(workspace.id, selectedModel));
        unawaited(
          _preferences.saveCreditSource(workspace.id, activeCreditSource),
        );
      }
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

  Future<T> _optional<T>(Future<T> request, T fallback) async {
    try {
      return await request;
    } on Exception {
      return fallback;
    }
  }

  Future<void> renameAssistant(String name) async {
    if (state.workspace == null) return;
    final generation = ++_soulRefreshGeneration;
    final workspaceVersion = _requestVersion;
    final scopeToken = _currentScopeToken?.call();
    final snapshot = await _repository.updateSoulNameSnapshot(name);
    if (isClosed ||
        generation != _soulRefreshGeneration ||
        workspaceVersion != _requestVersion ||
        scopeToken != _currentScopeToken?.call()) {
      return;
    }
    emit(state.copyWith(soul: snapshot.displaySoul, soulSnapshot: snapshot));
  }

  Future<void> refreshSoul() async {
    final generation = ++_soulRefreshGeneration;
    final workspaceVersion = _requestVersion;
    final scopeToken = _currentScopeToken?.call();
    final soul = await _repository.fetchSoul(forceRefresh: true);
    if (isClosed ||
        generation != _soulRefreshGeneration ||
        workspaceVersion != _requestVersion ||
        scopeToken != _currentScopeToken?.call()) {
      return;
    }
    emit(state.copyWith(soul: soul));
  }

  Future<bool> setSelectedModel(AssistantGatewayModel model) =>
      _selectModel(model);

  void restoreConversationSettings(AssistantConversationSettings? settings) {
    _settingsRequestVersion++;
    if (isClosed) return;
    final workspaceId = state.workspace?.id;
    _openConversation = settings == null || workspaceId == null
        ? null
        : (
            actorId: _repository.currentActorId,
            workspaceId: workspaceId,
            settings: settings,
          );
    if (settings == null) {
      // A new chat takes the session's mode, not the last opened
      // conversation's.
      emit(
        state.copyWith(
          conversationSettings: null,
          thinkingMode: _sessionThinkingMode,
        ),
      );
      return;
    }
    final model = _conversationModel(settings, state.availableModels);
    emit(
      state.copyWith(
        selectedModel: model,
        creditSource: settings.creditSource,
        thinkingMode: settings.thinkingMode,
        conversationSettings: settings,
      ),
    );
  }

  /// The kept conversation settings when they belong to [workspaceId] and
  /// the current actor; a different account never inherits them.
  AssistantConversationSettings? _openConversationFor(String workspaceId) {
    final open = _openConversation;
    return open != null &&
            open.workspaceId == workspaceId &&
            open.actorId == _repository.currentActorId
        ? open.settings
        : null;
  }

  AssistantGatewayModel _conversationModel(
    AssistantConversationSettings settings,
    List<AssistantGatewayModel> models,
  ) =>
      models.where((m) => m.value == settings.modelId).firstOrNull ??
      AssistantGatewayModel(
        value: settings.modelId,
        label: settings.modelId,
        provider: settings.modelId.split('/').first,
      );

  /// An acknowledged selection becomes the open conversation's stored
  /// settings; a new chat has none to follow.
  void _followAcknowledged(AssistantSettingsSelection selection) {
    final open = _openConversation;
    if (open == null || _openConversationFor(open.workspaceId) == null) return;
    _openConversation = (
      actorId: open.actorId,
      workspaceId: open.workspaceId,
      settings: AssistantConversationSettings(
        modelId: selection.modelId,
        creditSource: selection.creditSource,
        creditWsId: selection.creditWsId,
        thinkingMode: selection.thinkingMode,
      ),
    );
  }

  void restoreSelectedModel(AssistantGatewayModel model) {
    _settingsRequestVersion++;
    if (!isClosed) emit(state.copyWith(selectedModel: model));
  }

  /// Selects the response mode for later sends in this workspace session.
  /// Subscription models use their provider's defaults, so they keep the
  /// current mode.
  Future<bool> setThinkingMode(AssistantThinkingMode mode) =>
      _selectThinkingMode(mode);

  /// Selects the response mode for a conversation that sends it with each
  /// request (the legacy transport), so no settings write is needed.
  bool selectThinkingModeForRequests(AssistantThinkingMode mode) {
    if (isClosed ||
        !_acceptsSettingsChanges ||
        state.workspace == null ||
        _settingsSelectionPending ||
        mode == state.thinkingMode ||
        assistantModelUsesProviderDefaults(state.selectedModel)) {
      return false;
    }
    _settingsRequestVersion++;
    _sessionThinkingMode = mode;
    emit(state.copyWith(thinkingMode: mode));
    return true;
  }

  Future<bool> setCreditSource(AssistantCreditSource source) =>
      _selectCreditSource(source);

  AssistantPreparedResetContext? prepareResetWorkspaceContext(
    String contextId,
    bool Function() isCurrent,
  ) {
    final actor = _repository.currentActorId;
    final workspace = state.workspace;
    final version = _requestVersion;
    final contextRequestEpoch = _publicContextRequestEpoch;
    final scope = _currentScopeToken?.call();
    bool current() =>
        !isClosed &&
        actor != null &&
        workspace != null &&
        _repository.currentActorId == actor &&
        _preferences.matchesResetActor(actor) &&
        _requestVersion == version &&
        _publicContextRequestEpoch == contextRequestEpoch &&
        state.workspace?.id == workspace.id &&
        _currentScopeToken?.call() == scope &&
        isCurrent();
    if (!current()) return null;
    return AssistantPreparedResetContext(
      actorId: actor!,
      workspaceId: workspace!.id,
      isCurrent: current,
      publishCurrent: () {
        if (!current()) return false;
        emit(state.copyWith(workspaceContextId: contextId));
        return current();
      },
    );
  }

  Future<bool> resetWorkspaceContextAcknowledged(
    String contextId,
    bool Function() isCurrent,
  ) async {
    final actor = _repository.currentActorId;
    final workspace = state.workspace;
    final version = _requestVersion;
    final scope = _currentScopeToken?.call();
    bool scopeCurrent() =>
        !isClosed &&
        actor != null &&
        workspace != null &&
        _repository.currentActorId == actor &&
        _preferences.matchesResetActor(actor) &&
        _requestVersion == version &&
        state.workspace?.id == workspace.id &&
        _currentScopeToken?.call() == scope &&
        isCurrent();
    if (!scopeCurrent()) return false;
    final contextRequestEpoch = ++_publicContextRequestEpoch;
    bool current() =>
        _publicContextRequestEpoch == contextRequestEpoch && scopeCurrent();
    if (!await _preferences.saveWorkspaceContextIdAcknowledged(
          workspace!.id,
          contextId,
          actorId: actor!,
          isCurrent: current,
        ) ||
        !current()) {
      return false;
    }
    emit(state.copyWith(workspaceContextId: contextId));
    return current();
  }

  Future<void> setWorkspaceContextId(String contextId) async {
    final workspace = state.workspace;
    if (workspace == null) return;
    _publicContextRequestEpoch++;
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

    _emitIfOpen(state.copyWith(tasksInsight: tasks, calendarInsight: calendar));
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

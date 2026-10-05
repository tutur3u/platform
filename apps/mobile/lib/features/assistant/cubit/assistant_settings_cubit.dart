import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';

class AssistantSettingsState {
  const AssistantSettingsState({
    this.keepLiveWhileBrowsing = false,
    this.loading = true,
    this.loaded = false,
    this.saving = false,
    this.failed = false,
  });
  final bool keepLiveWhileBrowsing;
  final bool loading;
  final bool loaded;
  final bool saving;
  final bool failed;
}

/// Local preference editor, scoped to the account/workspace owning its route.
class AssistantSettingsCubit extends Cubit<AssistantSettingsState> {
  AssistantSettingsCubit({
    required this.workspaceId,
    required this.isScopeCurrent,
    AssistantPreferences? preferences,
  }) : _preferences = preferences ?? AssistantPreferences(),
       super(const AssistantSettingsState());

  final String workspaceId;
  final bool Function() isScopeCurrent;
  final AssistantPreferences _preferences;
  int _generation = 0;
  bool _current(int token) =>
      !isClosed && token == _generation && isScopeCurrent();

  Future<void> load() async {
    if (state.saving || !isScopeCurrent()) return;
    final token = ++_generation;
    emit(
      AssistantSettingsState(
        keepLiveWhileBrowsing: state.keepLiveWhileBrowsing,
      ),
    );
    try {
      final value = await _preferences.loadKeepLiveWhileBrowsing(workspaceId);
      if (!_current(token)) return;
      emit(
        AssistantSettingsState(
          keepLiveWhileBrowsing: value,
          loading: false,
          loaded: true,
        ),
      );
    } on Object {
      if (!_current(token)) return;
      emit(
        AssistantSettingsState(
          keepLiveWhileBrowsing: state.keepLiveWhileBrowsing,
          loading: false,
          failed: true,
        ),
      );
    }
  }

  Future<void> save({required bool value}) async {
    if (!state.loaded || state.loading || state.saving || !isScopeCurrent()) {
      return;
    }
    final token = ++_generation;
    final previous = state.keepLiveWhileBrowsing;
    emit(
      AssistantSettingsState(
        keepLiveWhileBrowsing: previous,
        loading: false,
        saving: true,
        loaded: true,
      ),
    );
    try {
      await _preferences.saveKeepLiveWhileBrowsing(
        workspaceId,
        value: value,
        shouldWrite: () => _current(token),
      );
      if (!_current(token)) return;
      emit(
        AssistantSettingsState(
          keepLiveWhileBrowsing: value,
          loading: false,
          loaded: true,
        ),
      );
    } on Object {
      if (!_current(token)) return;
      emit(
        AssistantSettingsState(
          keepLiveWhileBrowsing: previous,
          loading: false,
          loaded: true,
          failed: true,
        ),
      );
    }
  }
}

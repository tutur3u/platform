part of 'app.dart';

extension _AppWatchCompanion on _AppState {
  void _syncWatchCompanion() {
    if (_authCubit.state.status != AuthStatus.authenticated) {
      unawaited(_watchCompanion.clearSession());
      return;
    }
    unawaited(
      _watchCompanion.syncAuthenticatedState(
        workspace: _workspaceCubit.state.currentWorkspace,
        localeCode: _localeCubit.state.locale?.languageCode,
      ),
    );
  }
}

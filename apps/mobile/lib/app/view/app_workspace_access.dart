part of 'app.dart';

extension _AppWorkspaceAccess on _AppState {
  /// Resolves every per-workspace app gate when the active workspace changes,
  /// so the launcher, sidebar and router agree on which apps exist.
  void _syncWorkspaceAccess(String? wsId) {
    unawaited(_mastermind.access.syncWorkspace(wsId));
    unawaited(_habitsAccessCubit.syncWorkspace(wsId));
    unawaited(_educationAccessCubit.syncWorkspace(wsId));
    unawaited(_inventoryAccessCubit.syncWorkspace(wsId));
    unawaited(_cmsAccessCubit.syncWorkspace(wsId));
  }
}

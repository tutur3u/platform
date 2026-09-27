part of 'app.dart';

extension _AppInventoryWarmup on _AppState {
  void _registerInventoryWarmupTask() {
    CacheWarmupCoordinator.instance.register('inventory_catalog', ({
      forceRefresh = false,
    }) async {
      final workspace = _workspaceCubit.state.currentWorkspace;
      if (workspace == null) return;
      await _inventoryRepository.getProductOptions(
        workspace.id,
        forceRefresh: forceRefresh,
      );
    });
  }
}

import 'package:mobile/core/cache/offline_preparation_state.dart';
import 'package:mobile/core/cache/offline_preparer_registry.dart';
import 'package:mobile/core/feature_flags/mobile_flags.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';

extension MastermindOfflinePreparation on MastermindRuntime {
  void registerOfflinePreparation(
    OfflinePreparerRegistry registry,
    MobileFlagsState flags,
  ) {
    registry.unregister('mastermind');
    if (!flags.enabled(MobileFlag.offlineReadMastermind)) return;
    registry.register('mastermind', MobileFlag.offlineReadMastermind, (
      wsId,
    ) async {
      await access.sync(wsId, quiet: true);
      if (access.state.wsId != wsId || !access.state.visible) {
        throw const OfflinePreparationUnavailable();
      }
      await snapshot.prepareOffline();
      if (access.state.wsId != wsId || !access.state.visible) {
        throw const OfflinePreparationUnavailable();
      }
    });
  }
}

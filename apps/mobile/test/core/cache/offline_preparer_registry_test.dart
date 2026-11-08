import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/feature_flags/mobile_flags.dart';

void main() {
  for (final master in [false, true]) {
    for (final enabled in [false, true]) {
      test(
        'coordinator gates registration master=$master app=$enabled',
        () async {
          final registry = OfflinePreparerRegistry(
            isEnabled: (flag) =>
                flag == MobileFlag.mobileOffline ? master : enabled,
          );
          final calls = <String>[];
          registry
            ..register(
              'habits',
              MobileFlag.offlineReadHabits,
              (_) async => calls.add('habits'),
            )
            ..register('finance', null, (_) async => calls.add('finance'));
          final coordinator = OfflinePreparationCoordinator.forTesting(
            load: (_, _) async => {},
            write: (_, _, _) async {},
            registry: registry,
          );
          await coordinator.run(userId: 'user', workspaceId: 'workspace');
          expect(calls, ['finance', if (master && enabled) 'habits']);
          coordinator.state.dispose();
        },
      );
    }
  }
}

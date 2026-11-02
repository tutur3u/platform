import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/cache/offline_preparation_intent.dart';
import 'package:mobile/data/sources/api_client.dart';

class _Store implements OfflinePreparationIntentStore {
  OfflinePreparationIntent? plan;
  @override
  Future<OfflinePreparationIntent?> load(String user, String workspace) async =>
      plan;
  @override
  Future<void> save(
    String user,
    String workspace,
    OfflinePreparationIntent? intent,
  ) async => plan = intent;
}

void main() {
  for (final code in [429, 503]) {
    test(
      '$code on Finance continues others and retries only waiting',
      () async {
        var now = DateTime.utc(2026);
        final store = _Store();
        final calls = <String>[];
        var blocked = true;
        final jobs = OfflinePreparationCoordinator.forTesting(
          load: (_, _) async => {},
          write: (_, _, _) async {},
          intents: store,
          clock: () => now,
        );
        for (final id in OfflinePreparationCoordinator.productIds) {
          jobs.register(id, (_) async {
            calls.add(id);
            if (id == 'finance' && blocked) {
              throw ApiException(
                message: 'Busy',
                statusCode: code,
                retryAfter: 7,
              );
            }
          });
        }
        await jobs.run(userId: 'u', workspaceId: 'w');
        expect(calls, OfflinePreparationCoordinator.productIds);
        final finance = jobs.state.value.products['finance']!;
        expect(finance.status, OfflinePreparationStatus.waitingRetry);
        expect(finance.errorMessage, contains('$code'));
        expect(finance.retryAt, now.add(const Duration(seconds: 7)));
        expect(jobs.state.value.completed, 3);
        calls.clear();
        await jobs.resumePending(userId: 'u', workspaceId: 'w');
        expect(calls, isEmpty);
        now = now.add(const Duration(seconds: 7));
        blocked = false;
        await jobs.resumePending(userId: 'u', workspaceId: 'w');
        expect(calls, ['finance']);
        expect(jobs.state.value.completed, 4);
        jobs.cancel();
      },
    );
  }
  for (final network in [
    [ConnectivityResult.vpn],
    [ConnectivityResult.vpn, ConnectivityResult.wifi],
    [ConnectivityResult.vpn, ConnectivityResult.ethernet],
  ]) {
    test('Wi-Fi gate publishes real state for $network', () async {
      var calls = 0;
      final jobs = OfflinePreparationCoordinator.forTesting(
        load: (_, _) async => {},
        write: (_, _, _) async {},
        network: () async => network,
      )..register('finance', (_) async => calls++);
      await jobs.run(userId: 'u', workspaceId: 'w');
      final allowed = network.length > 1;
      expect(calls, allowed ? 1 : 0);
      expect(
        jobs.state.value.products['finance']!.status,
        allowed
            ? OfflinePreparationStatus.ready
            : OfflinePreparationStatus.waitingWifi,
      );
      jobs.cancel();
    });
  }
}

import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/cache/offline_preparation_intent.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/offline_api_request.dart';

void main() {
  test('a protection outage pauses the whole plan after one request', () async {
    final coordinator = OfflinePreparationCoordinator.forTesting(
      load: (_, _) async => {},
      write: (_, _, _) async {},
    );
    final calls = <String>[];
    for (final id in OfflinePreparationCoordinator.productIds) {
      coordinator.register(id, (_) async {
        calls.add(id);
        throw const ApiException(
          statusCode: 503,
          message: 'Download protection is temporarily unavailable.',
          retryAfter: 30,
        );
      });
    }
    await coordinator.run(userId: 'actor', workspaceId: 'workspace');
    expect(calls, ['finance']);
    expect(coordinator.state.value.running, isFalse);
    expect(coordinator.state.value.completed, 0);
    coordinator.cancel();
    coordinator.state.dispose();
  });
  test('an explicit retry restarts a paused plan immediately', () async {
    var calls = 0;
    final coordinator =
        OfflinePreparationCoordinator.forTesting(
          load: (_, _) async => {},
          write: (_, _, _) async {},
        )..register('tasks', (_) async {
          calls++;
          if (calls == 1) {
            throw const ApiException(
              statusCode: 503,
              message: 'Unavailable',
              retryAfter: 75,
            );
          }
        });
    await coordinator.run(
      userId: 'actor',
      workspaceId: 'workspace',
      productId: 'tasks',
    );
    expect(coordinator.state.value.retryAt, isNotNull);
    await coordinator.run(
      userId: 'actor',
      workspaceId: 'workspace',
      productId: 'tasks',
    );
    expect(calls, 2);
    expect(coordinator.state.value.retryAt, isNull);
    expect(
      coordinator.state.value.products['tasks']!.status,
      OfflinePreparationStatus.ready,
    );
    coordinator.cancel();
    coordinator.state.dispose();
  });

  test('service retry delays are bounded to fifteen minutes', () async {
    final now = DateTime.utc(2026, 10, 25);
    final coordinator =
        OfflinePreparationCoordinator.forTesting(
          load: (_, _) async => {},
          write: (_, _, _) async {},
          clock: () => now,
        )..register('tasks', (_) async {
          throw const ApiException(
            statusCode: 429,
            message: 'Slow down',
            retryAfter: 86400,
          );
        });
    await coordinator.run(
      userId: 'actor',
      workspaceId: 'workspace',
      productId: 'tasks',
    );
    expect(
      coordinator.state.value.retryAt,
      now.add(const Duration(minutes: 15)),
    );
    coordinator.cancel();
    coordinator.state.dispose();
  });

  testWidgets(
    'the one-shot timer resumes at the deadline without a challenge',
    (tester) async {
      final intents = _Intents();
      var calls = 0;
      bool? resumedAllowsChallenge;
      final coordinator =
          OfflinePreparationCoordinator.forTesting(
            load: (_, _) async => {},
            write: (_, _, _) async {},
            intents: intents,
            clock: tester.binding.clock.now,
          )..register('tasks', (_) async {
            calls++;
            if (calls > 1) {
              resumedAllowsChallenge = OfflineApiRequest.allowsChallenge;
            }
            if (calls == 1) {
              throw const ApiException(
                statusCode: 503,
                message: 'Unavailable',
                retryAfter: 75,
              );
            }
          });
      await coordinator.run(
        userId: 'actor',
        workspaceId: 'workspace',
        productId: 'tasks',
      );
      await tester.pump(const Duration(seconds: 74));
      expect(calls, 1);
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
      expect(calls, 2);
      expect(resumedAllowsChallenge, isFalse);
      expect(
        coordinator.state.value.completed,
        1,
        reason: coordinator.state.value.products['tasks']?.errorMessage,
      );
      expect(coordinator.state.value.retryAt, isNull);
      coordinator.cancel();
      await tester.pump();
      coordinator.state.dispose();
    },
  );

  test(
    'reconnect resumes a retained Wi-Fi plan in the current scope',
    () async {
      final events = StreamController<List<ConnectivityResult>>.broadcast(
        sync: true,
      );
      var network = [ConnectivityResult.none];
      var calls = 0;
      final entered = Completer<void>();
      final coordinator =
          OfflinePreparationCoordinator.forTesting(
            load: (_, _) async => {},
            write: (_, _, _) async {},
            intents: _Intents(),
            network: () async => network,
            networkEvents: events.stream,
          )..register('tasks', (_) async {
            calls++;
            if (!entered.isCompleted) entered.complete();
          });
      await coordinator.run(
        userId: 'actor',
        workspaceId: 'workspace',
        productId: 'tasks',
      );
      expect(calls, 0);
      network = [ConnectivityResult.wifi];
      events.add(network);
      await entered.future;
      await Future<void>.delayed(Duration.zero);
      expect(calls, 1);
      await coordinator.setScope();
      events.add(network);
      await Future<void>.delayed(Duration.zero);
      expect(calls, 1);
      await events.close();
      coordinator.state.dispose();
    },
  );

  test(
    'restart publishes the retained pause before scheduling retry',
    () async {
      final deadline = DateTime.utc(2026, 10, 25, 1);
      final intents = _Intents()
        ..intent = OfflinePreparationIntent(
          products: {'tasks'},
          retryAt: deadline,
          retryAttempts: 1,
        );
      final coordinator =
          OfflinePreparationCoordinator.forTesting(
            load: (_, _) async => {},
            write: (_, _, _) async {},
            intents: intents,
            clock: () => deadline.subtract(const Duration(seconds: 15)),
          )..register(
            'tasks',
            (_) async => fail('Cooldown must prevent a request'),
          );
      await coordinator.setScope(userId: 'actor', workspaceId: 'workspace');
      await coordinator.resumePending(
        userId: 'actor',
        workspaceId: 'workspace',
      );
      expect(coordinator.state.value.retryAt, deadline);
      expect(coordinator.state.value.retryExhausted, isFalse);
      coordinator.cancel();
      await Future<void>.delayed(Duration.zero);
      expect(coordinator.state.value.retryAt, isNull);
      expect(intents.intent!.products, isEmpty);
      coordinator.state.dispose();
    },
  );

  for (final status in [429, 503]) {
    test(
      '$status retries respect persisted deadline, consent and budget',
      () async {
        var now = DateTime.utc(2026, 10, 25);
        final intents = _Intents();
        var calls = 0;
        var network = [ConnectivityResult.wifi];
        OfflinePreparationCoordinator create() {
          final coordinator =
              OfflinePreparationCoordinator.forTesting(
                load: (_, _) async => {},
                write: (_, _, _) async {},
                intents: intents,
                clock: () => now,
                network: () async => network,
              )..register('calendar', (_) async {
                calls++;
                throw ApiException(
                  statusCode: status,
                  message: 'Service unavailable',
                  retryAfter: 75,
                );
              });
          return coordinator;
        }

        final coordinator = create();
        await coordinator.run(
          userId: 'actor',
          workspaceId: 'workspace',
          productId: 'calendar',
          wifiOnly: false,
        );
        expect(calls, 1);
        expect(intents.intent!.products, {'calendar'});
        expect(intents.intent!.wifiOnly, isFalse);
        expect(intents.intent!.retryAt, now.add(const Duration(seconds: 75)));
        await coordinator.resumePending(
          userId: 'actor',
          workspaceId: 'workspace',
        );
        await coordinator.run(
          userId: 'actor',
          workspaceId: 'workspace',
          requestedProducts: {'calendar'},
          wifiOnly: false,
          automatic: true,
        );
        expect(
          calls,
          1,
          reason: 'Automatic and lifecycle events do not bypass cooldown',
        );
        now = now.add(const Duration(seconds: 74));
        await coordinator.resumePending(
          userId: 'actor',
          workspaceId: 'workspace',
        );
        expect(calls, 1);
        now = now.add(const Duration(seconds: 1));
        network = [ConnectivityResult.none];
        await coordinator.resumePending(
          userId: 'actor',
          workspaceId: 'workspace',
        );
        expect(calls, 1);
        network = [ConnectivityResult.mobile];
        await coordinator.resumePending(
          userId: 'actor',
          workspaceId: 'workspace',
        );
        expect(calls, 2);
        now = now.add(const Duration(seconds: 75));
        await coordinator.resumePending(
          userId: 'actor',
          workspaceId: 'workspace',
        );
        expect(calls, 3);
        expect(coordinator.state.value.retryExhausted, isTrue);
        now = now.add(const Duration(seconds: 75));
        await coordinator.resumePending(
          userId: 'actor',
          workspaceId: 'workspace',
        );
        expect(
          calls,
          3,
          reason: 'Automatic attempts have a durable stop fence',
        );
        final restored = create();
        await restored.setScope(userId: 'actor', workspaceId: 'workspace');
        await restored.resumePending(userId: 'actor', workspaceId: 'workspace');
        expect(calls, 3, reason: 'Restart does not reset the attempt budget');
        expect(restored.state.value.retryAt, intents.intent!.retryAt);
        expect(restored.state.value.retryExhausted, isTrue);
        await restored.run(
          userId: 'actor',
          workspaceId: 'workspace',
          productId: 'calendar',
          wifiOnly: false,
        );
        expect(
          calls,
          4,
          reason: 'Explicit user retry starts a fresh bounded plan',
        );
        coordinator.cancel();
        restored.cancel();
        await Future<void>.delayed(Duration.zero);
        coordinator.state.dispose();
        restored.state.dispose();
      },
    );
  }

  test(
    'cancel clears the retained plan and prevents later background replay',
    () async {
      var now = DateTime.utc(2026, 10, 25);
      final intents = _Intents();
      var calls = 0;
      final coordinator =
          OfflinePreparationCoordinator.forTesting(
            load: (_, _) async => {},
            write: (_, _, _) async {},
            intents: intents,
            clock: () => now,
          )..register('tasks', (_) async {
            calls++;
            throw const ApiException(statusCode: 503, message: 'Unavailable');
          });
      await coordinator.run(
        userId: 'actor',
        workspaceId: 'workspace',
        productId: 'tasks',
      );
      expect(intents.intent!.retryAt, now.add(const Duration(seconds: 30)));
      coordinator.cancel();
      await Future<void>.delayed(Duration.zero);
      now = now.add(const Duration(minutes: 1));
      await coordinator.resumePending(
        userId: 'actor',
        workspaceId: 'workspace',
      );
      expect(calls, 1);
      expect(intents.intent!.products, isEmpty);
      expect(coordinator.state.value.retryAt, isNull);
      coordinator.state.dispose();
    },
  );
}

class _Intents implements OfflinePreparationIntentStore {
  OfflinePreparationIntent? intent;
  @override
  Future<OfflinePreparationIntent?> load(String user, String workspace) async =>
      intent;
  @override
  Future<void> save(
    String user,
    String workspace,
    OfflinePreparationIntent? value,
  ) async {
    intent = value;
  }
}

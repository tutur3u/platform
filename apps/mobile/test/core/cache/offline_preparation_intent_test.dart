import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/cache/offline_preparation_intent.dart';
import 'package:mobile/data/sources/api_client.dart';

class _Intents implements OfflinePreparationIntentStore {
  final plans = <String, OfflinePreparationIntent>{};
  Completer<OfflinePreparationIntent?>? blocked;
  Completer<void>? blockedSave;
  int saves = 0;
  @override
  Future<OfflinePreparationIntent?> load(String user, String workspace) async =>
      await (blocked?.future ?? Future.value(plans['$user/$workspace']));
  @override
  Future<void> save(
    String user,
    String workspace,
    OfflinePreparationIntent? intent,
  ) async {
    saves++;
    await blockedSave?.future;
    if (intent == null || intent.products.isEmpty) {
      plans.remove('$user/$workspace');
    } else {
      plans['$user/$workspace'] = intent;
    }
  }
}

void main() {
  OfflinePreparationCoordinator coordinator(
    _Intents intents, {
    bool cellular = false,
    Stream<List<ConnectivityResult>>? events,
  }) => OfflinePreparationCoordinator.forTesting(
    load: (_, _) async => {},
    write: (_, _, _) async {},
    intents: intents,
    network: () async => [
      if (cellular) ConnectivityResult.mobile else ConnectivityResult.wifi,
    ],
    networkEvents: events,
  );

  test(
    'Wi-Fi-only plan survives restart and resumes only original modules',
    () async {
      final intents = _Intents();
      var calls = 0;
      final first = coordinator(intents, cellular: true)
        ..register('tasks', (_) async => calls++);
      await first.run(
        userId: 'actor',
        workspaceId: 'workspace',
        productId: 'tasks',
      );
      expect(calls, 0);
      expect(intents.plans['actor/workspace']?.products, {'tasks'});
      final restarted = coordinator(intents)
        ..register('tasks', (_) async => calls++)
        ..register('finance', (_) async => fail('Never requested'));
      await restarted.setScope(userId: 'actor', workspaceId: 'workspace');
      await restarted.resumePending(userId: 'actor', workspaceId: 'workspace');
      expect(calls, 1);
      expect(intents.plans, isEmpty);
      expect(
        restarted.state.value.products['tasks']?.status,
        OfflinePreparationStatus.ready,
      );
    },
  );

  test(
    'delayed intent load is fenced across same-ID logout/re-entry',
    () async {
      final intents = _Intents()
        ..blocked = Completer<OfflinePreparationIntent?>();
      var calls = 0;
      final jobs = coordinator(intents)
        ..register('tasks', (_) async => calls++);
      await jobs.setScope(userId: 'actor', workspaceId: 'workspace');
      final old = jobs.resumePending(userId: 'actor', workspaceId: 'workspace');
      await jobs.setScope();
      await jobs.setScope(userId: 'actor', workspaceId: 'workspace');
      intents.blocked!.complete(
        const OfflinePreparationIntent(products: {'tasks'}),
      );
      await old;
      expect(calls, 0);
    },
  );

  test(
    'network loss fences current module publication and retains its intent',
    () async {
      final events = StreamController<List<ConnectivityResult>>.broadcast(
        sync: true,
      );
      final intents = _Intents();
      final entered = Completer<void>();
      final finish = Completer<void>();
      final jobs = coordinator(intents, events: events.stream)
        ..register('tasks', (_) async {
          entered.complete();
          await finish.future;
        });
      final work = jobs.run(
        userId: 'actor',
        workspaceId: 'workspace',
        productId: 'tasks',
      );
      await entered.future;
      events.add([ConnectivityResult.mobile]);
      expect(jobs.canContinue('actor', 'workspace'), isFalse);
      finish.complete();
      await work;
      expect(
        jobs.state.value.products['tasks']?.status,
        isNot(OfflinePreparationStatus.ready),
      );
      expect(intents.plans['actor/workspace']?.products, {'tasks'});
      await events.close();
    },
  );

  test(
    'definitive denial clears intent; MFA and transport failures retain it',
    () async {
      for (final failure in [
        const ApiException(message: 'Denied', statusCode: 401),
        const ApiException(message: 'Denied', statusCode: 403),
        const ApiException(
          message: 'Verification',
          statusCode: 403,
          isVerificationRequired: true,
        ),
        StateError('Network'),
      ]) {
        final intents = _Intents();
        final jobs = coordinator(intents)
          ..register(
            'tasks',
            (_) async => Error.throwWithStackTrace(failure, StackTrace.current),
          );
        await jobs.run(
          userId: 'actor',
          workspaceId: 'workspace',
          productId: 'tasks',
        );
        expect(
          intents.plans.isEmpty,
          failure is ApiException && !failure.isVerificationRequired,
        );
      }
    },
  );

  test(
    'auth and foreground resume triggers coalesce one intent load and task',
    () async {
      final intents = _Intents()
        ..blocked = Completer<OfflinePreparationIntent?>();
      final entered = Completer<void>();
      final finish = Completer<void>();
      var calls = 0;
      final jobs = coordinator(intents)
        ..register('tasks', (_) async {
          calls++;
          entered.complete();
          await finish.future;
        });
      await jobs.setScope(userId: 'actor', workspaceId: 'workspace');
      final first = jobs.resumePending(
        userId: 'actor',
        workspaceId: 'workspace',
      );
      final second = jobs.resumePending(
        userId: 'actor',
        workspaceId: 'workspace',
      );
      intents.blocked!.complete(
        const OfflinePreparationIntent(products: {'tasks'}),
      );
      await entered.future;
      expect(calls, 1);
      finish.complete();
      await Future.wait([first, second]);
      expect(calls, 1);
      expect(intents.plans, isEmpty);
    },
  );

  test(
    'busy is published while durable admission blocks and APIs wait',
    () async {
      final intents = _Intents()..blockedSave = Completer<void>();
      var calls = 0;
      final jobs = coordinator(intents)
        ..register('tasks', (_) async => calls++);
      await jobs.setScope(userId: 'actor', workspaceId: 'workspace');
      final work = jobs.run(
        userId: 'actor',
        workspaceId: 'workspace',
        productId: 'tasks',
      );
      await Future<void>.delayed(Duration.zero);
      expect(jobs.state.value.running, isTrue);
      expect(calls, 0);
      intents.blockedSave!.complete();
      await work;
      expect(calls, 1);
    },
  );

  test('queued intent writes never start after actor/workspace ABA', () async {
    final intents = _Intents()..blockedSave = Completer<void>();
    final jobs = coordinator(intents, cellular: true)
      ..register('tasks', (_) async {});
    await jobs.setScope(userId: 'actor', workspaceId: 'workspace');
    final work = jobs.run(
      userId: 'actor',
      workspaceId: 'workspace',
      productId: 'tasks',
    );
    await Future<void>.delayed(Duration.zero);
    expect(intents.saves, 1);
    jobs.cancel(); // The forget write queues behind the in-flight admission.
    await jobs.setScope();
    await jobs.setScope(userId: 'actor', workspaceId: 'workspace');
    intents.blockedSave!.complete();
    await work;
    await Future<void>.delayed(Duration.zero);
    expect(intents.saves, 1);
  });

  test('explicit cancellation forgets the resumable plan', () async {
    final intents = _Intents();
    final jobs = coordinator(intents, cellular: true)
      ..register('tasks', (_) async {});
    await jobs.run(
      userId: 'actor',
      workspaceId: 'workspace',
      productId: 'tasks',
    );
    jobs.cancel();
    await Future<void>.delayed(Duration.zero);
    expect(intents.plans, isEmpty);
  });
}

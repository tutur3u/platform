import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/startup/optional_startup.dart';
import 'package:mobile/core/startup/startup_state.dart';

void main() {
  test('appearance and cache start together; queue waits for cache', () async {
    final appearance = Completer<String>();
    final cache = Completer<void>();
    final queue = Completer<void>();
    final events = <String>[];
    var finished = false;
    final startup =
        initializeStartupState(
          loadAppearance: () {
            events.add('appearance');
            return appearance.future;
          },
          initializeCache: () {
            events.add('cache');
            return cache.future;
          },
          restoreMutations: () {
            events.add('queue');
            return queue.future;
          },
          onCacheError: (error, stack) =>
              fail('Unexpected cache error: $error'),
        ).then((value) {
          finished = true;
          return value;
        });

    // Neither service has completed, so a sequential implementation fails here.
    expect(events, ['appearance', 'cache']);
    cache.complete();
    await pumpEventQueue();
    expect(events, ['appearance', 'cache', 'queue']);
    queue.complete();
    await pumpEventQueue();
    expect(finished, isFalse);
    appearance.complete('account appearance');
    expect(await startup, 'account appearance');
  });

  test('completed appearance still waits for offline restoration', () async {
    final queue = Completer<void>();
    var finished = false;
    final startup = initializeStartupState(
      loadAppearance: () async => 'appearance',
      initializeCache: () async {},
      restoreMutations: () => queue.future,
      onCacheError: (error, stack) => fail('Unexpected cache error: $error'),
    ).then((value) => finished = true);
    await pumpEventQueue();
    expect(finished, isFalse);
    queue.complete();
    await startup;
    expect(finished, isTrue);
  });

  for (final synchronous in [true, false]) {
    for (final failingStage in ['cache', 'queue']) {
      test(
        '$failingStage failure (sync=$synchronous) reports and continues',
        () async {
          final error = StateError(failingStage);
          final stack = StackTrace.current;
          final reports = <Object>[];
          var queueCalls = 0;
          Future<void> failure() {
            if (synchronous) Error.throwWithStackTrace(error, stack);
            return Future<void>.error(error, stack);
          }

          final result = await initializeStartupState(
            loadAppearance: () async => 'appearance',
            initializeCache: failingStage == 'cache' ? failure : () async {},
            restoreMutations: () {
              queueCalls++;
              return failure();
            },
            onCacheError: (actual, actualStack) {
              reports.add(actual);
              expect(actualStack.toString(), stack.toString());
            },
          );
          expect(result, 'appearance');
          expect(reports, [same(error)]);
          expect(queueCalls, failingStage == 'cache' ? 0 : 1);
        },
      );
    }
  }

  test('appearance fallback remains usable while cache finishes', () async {
    final errors = <Object>[];
    final result = await initializeStartupState(
      loadAppearance: () async {
        try {
          throw StateError('appearance read');
        } on Object catch (error) {
          errors.add(error);
          return 'default';
        }
      },
      initializeCache: () async {},
      restoreMutations: () async {},
      onCacheError: (error, stack) => fail('Unexpected cache error: $error'),
    );
    expect(result, 'default');
    expect(errors, hasLength(1));
  });

  test(
    'unhandled appearance failure retains error and stack after settling',
    () async {
      final error = StateError('unexpected appearance error');
      final stack = StackTrace.current;
      final cache = Completer<void>();
      var queueRestored = false;
      var surfaced = false;
      final startup =
          initializeStartupState<String>(
            loadAppearance: () => Future<String>.error(error, stack),
            initializeCache: () => cache.future,
            restoreMutations: () async => queueRestored = true,
            onCacheError: (error, stack) =>
                fail('Unexpected cache error: $error'),
          ).then<void>(
            (_) => fail('Expected failure'),
            onError: (Object e, StackTrace s) {
              surfaced = true;
              expect(e, same(error));
              expect(s.toString(), stack.toString());
            },
          );
      await pumpEventQueue();
      expect(surfaced, isFalse);
      cache.complete();
      await startup;
      expect(queueRestored, isTrue);
      expect(surfaced, isTrue);
    },
  );

  group('initializeBootstrapServices', () {
    test('platform services and preferences start together', () async {
      final platform = Completer<void>();
      final preferences = Completer<String>();
      final events = <String>[];
      var finished = false;
      final startup =
          initializeBootstrapServices<String>(
            initializePlatformServices: () {
              events.add('platform');
              return platform.future;
            },
            loadLocalPreferences: () {
              events.add('preferences');
              return preferences.future;
            },
          ).then((value) {
            finished = true;
            return value;
          });

      // A sequential implementation would not have started preferences yet.
      expect(events, ['platform', 'preferences']);
      preferences.complete('route');
      await pumpEventQueue();
      expect(finished, isFalse);
      platform.complete();
      expect(await startup, 'route');
    });

    test('waits for the slower preferences branch too', () async {
      final preferences = Completer<String>();
      var finished = false;
      final startup =
          initializeBootstrapServices<String>(
            initializePlatformServices: () async {},
            loadLocalPreferences: () => preferences.future,
          ).then((value) {
            finished = true;
            return value;
          });
      await pumpEventQueue();
      expect(finished, isFalse);
      preferences.complete('late');
      expect(await startup, 'late');
    });

    test('a failing branch surfaces only after its sibling settles', () async {
      final error = StateError('preferences failed');
      final platform = Completer<void>();
      var surfaced = false;
      final startup =
          initializeBootstrapServices<String>(
            initializePlatformServices: () => platform.future,
            loadLocalPreferences: () => Future<String>.error(error),
          ).then<void>(
            (_) => fail('Expected failure'),
            onError: (Object e, StackTrace _) {
              surfaced = true;
              expect(e, same(error));
            },
          );
      await pumpEventQueue();
      expect(surfaced, isFalse);
      platform.complete();
      await startup;
      expect(surfaced, isTrue);
    });
  });

  group('startPushForCurrentAccount', () {
    test('signed-in launch starts the session for that account', () async {
      final calls = <String>[];
      await startPushForCurrentAccount(
        currentUserId: () => 'user-1',
        initialize: () async => calls.add('initialize'),
        startSession: (userId) async => calls.add('session:$userId'),
      );
      // startSession initializes push itself.
      expect(calls, ['session:user-1']);
    });

    test('signed-out launch still initializes push', () async {
      final calls = <String>[];
      await startPushForCurrentAccount(
        currentUserId: () => null,
        initialize: () async => calls.add('initialize'),
        startSession: (userId) async => calls.add('session:$userId'),
      );
      expect(calls, ['initialize']);
    });

    test('reads the account when it runs, not when scheduled', () async {
      var userId = 'user-1';
      final calls = <String>[];
      Future<void> start() => startPushForCurrentAccount(
        currentUserId: () => userId,
        initialize: () async => calls.add('initialize'),
        startSession: (id) async => calls.add('session:$id'),
      );
      userId = 'user-2';
      await start();
      expect(calls, ['session:user-2']);
    });
  });

  testWidgets('deferred push setup runs after the first frame', (tester) async {
    final calls = <String>[];
    scheduleOptionalStartup(
      () => startPushForCurrentAccount(
        currentUserId: () => 'user-1',
        initialize: () async => calls.add('initialize'),
        startSession: (id) async => calls.add('session:$id'),
      ),
    );
    expect(calls, isEmpty);
    await tester.pumpWidget(const SizedBox());
    expect(calls, ['session:user-1']);
  });
}

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
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
}

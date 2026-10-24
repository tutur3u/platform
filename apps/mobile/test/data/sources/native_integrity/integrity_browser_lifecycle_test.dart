import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/native_integrity/integrity_browser_lifecycle.dart';

void main() {
  test(
    'late creation is closed without holding the request deadline',
    () async {
      final lifecycle = IntegrityBrowserLifecycle();
      final creation = Completer<Object>();
      var closed = 0;
      var used = 0;
      await expectLater(
        lifecycle.run<Object>(
          create: () => creation.future,
          use: (_, _) async {
            used++;
            return 'token';
          },
          close: (_) async {
            closed++;
          },
          deadline: const Duration(milliseconds: 5),
        ),
        throwsA(isA<TimeoutException>()),
      );
      creation.complete(Object());
      await Future<void>.delayed(Duration.zero);
      expect(closed, 1);
      expect(used, 0);
    },
  );
  test(
    'stalled run returns on deadline and closes its owned browser',
    () async {
      final lifecycle = IntegrityBrowserLifecycle();
      final running = Completer<String>();
      var closed = 0;
      await expectLater(
        lifecycle.run<Object>(
          create: () async => Object(),
          use: (_, _) => running.future,
          close: (_) async {
            closed++;
          },
          deadline: const Duration(milliseconds: 5),
        ),
        throwsA(isA<TimeoutException>()),
      );
      await Future<void>.delayed(Duration.zero);
      expect(closed, 1);
      running.complete('late-token');
      await Future<void>.delayed(Duration.zero);
      expect(
        closed,
        2,
        reason: 'Late plugin completion gets owned cleanup again',
      );
    },
  );
  test(
    'stalled cleanup never blocks successful request or permits new windows',
    () async {
      final lifecycle = IntegrityBrowserLifecycle();
      final disposal = Completer<void>();
      Future<String> run() => lifecycle.run<Object>(
        create: () async => Object(),
        use: (_, _) async => 'token',
        close: (_) => disposal.future,
        deadline: const Duration(milliseconds: 5),
      );
      expect(await run(), 'token');
      await expectLater(run(), throwsStateError);
      disposal.complete();
      await Future<void>.delayed(Duration.zero);
      expect(await run(), 'token');
    },
  );
  test('late disposal error is consumed and fences further creation', () async {
    final lifecycle = IntegrityBrowserLifecycle();
    final disposal = Completer<void>();
    Future<String> run() => lifecycle.run<Object>(
      create: () async => Object(),
      use: (_, _) async => 'token',
      close: (_) => disposal.future,
    );
    expect(await run(), 'token');
    disposal.completeError(StateError('unknown native cleanup'));
    await Future<void>.delayed(Duration.zero);
    await expectLater(run(), throwsStateError);
  });
}

import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

typedef LiveStartupCleanup = void Function(Future<void> Function() cleanup);

/// Drains fixture resources before the widget test leaves its fake-async zone.
void startupTest(
  String description,
  Future<void> Function(WidgetTester tester, LiveStartupCleanup cleanup) body,
) {
  testWidgets(description, (tester) async {
    Future<void> Function()? dispose;
    try {
      await body(tester, (cleanup) => dispose = cleanup);
    } finally {
      await dispose?.call();
    }
  });
}

/// Minimizes (or closes, once ended) a presented full-screen Live call, as a
/// user does before using the in-shell dock controls beneath it.
Future<void> minimizeLiveCallSurface(WidgetTester tester) async {
  for (final key in [
    'assistant-live-call-minimize',
    'assistant-live-call-close',
  ]) {
    final control = find.byKey(ValueKey(key));
    if (control.evaluate().isEmpty) continue;
    await tester.tap(control);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    return;
  }
}

/// Requires the owned operation to finish without advancing a timeout clock.
Future<void> expectLiveStartupCompletion(
  WidgetTester tester,
  Future<void> operation, {
  required String reason,
}) async {
  var completed = false;
  AsyncError? failure;
  final observed = operation.then<void>(
    (_) => completed = true,
    onError: (Object error, StackTrace stack) {
      failure = AsyncError(error, stack);
      completed = true;
    },
  );
  await tester.pump();
  await tester.runAsync(() async {});
  await tester.pump();
  expect(completed, isTrue, reason: reason);
  await observed;
  if (failure case final error?) {
    Error.throwWithStackTrace(error.error, error.stackTrace);
  }
}

/// Drains only an owned teardown future across real and fake microtasks.
Future<void> drainLiveFixtureCleanup(
  WidgetTester tester,
  Future<void> operation,
) => driveLiveStartupFuture(
  tester,
  operation,
  reason: 'Owned Live teardown did not drain.',
);

/// Drives a known callback or entry handshake without advancing fake time.
Future<void> driveLiveStartupFuture(
  WidgetTester tester,
  Future<void> operation, {
  required String reason,
}) async {
  var completed = false;
  AsyncError? failure;
  final observed = operation.then<void>(
    (_) => completed = true,
    onError: (Object error, StackTrace stack) {
      failure = AsyncError(error, stack);
      completed = true;
    },
  );
  final budget = Stopwatch()..start();
  while (!completed && budget.elapsed < const Duration(seconds: 3)) {
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.idle();
  }
  expect(completed, isTrue, reason: reason);
  await observed;
  if (failure case final error?) {
    Error.throwWithStackTrace(error.error, error.stackTrace);
  }
}

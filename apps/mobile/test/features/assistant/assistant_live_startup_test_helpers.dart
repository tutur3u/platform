import 'dart:async';

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
  expect(completed, isTrue, reason: reason);
  await observed;
  if (failure case final error?) {
    Error.throwWithStackTrace(error.error, error.stackTrace);
  }
}

part of 'assistant_live_reply_guard_test.dart';

// Native stream cancellation can resume through root and fake microtasks.
Future<void> _driveSubmissionFuture(
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

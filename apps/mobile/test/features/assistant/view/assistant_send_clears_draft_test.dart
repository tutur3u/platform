import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import 'assistant_native_dispatch_v116_harness.dart';

void main() {
  testWidgets('send empties the composer before the server acknowledges', (
    tester,
  ) async {
    final h = (await tester.runAsync(NativeDispatchHarness.create))!;
    addTearDown(() => h.dispose(tester));
    await h.open(tester);
    h.port.responseGate = Completer<void>();

    await h.pageSend(tester, 'Plan my evening');
    await tester.runAsync(() => h.port.postEntered.future);

    // The POST is still held, yet the draft is gone and the optimistic user
    // bubble is already in the transcript.
    expect(h.port.responseGate!.isCompleted, isFalse);
    expect(h.draft(tester).text, isEmpty);
    expect(h.chat.state.messages.where((m) => m.role == 'user'), hasLength(1));

    h.port.release();
    await h.settle(tester);
    expect(h.draft(tester).text, isEmpty);
    expect(h.port.posts, hasLength(1));
  });
}

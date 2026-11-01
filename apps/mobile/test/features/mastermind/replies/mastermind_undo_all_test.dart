import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';

import '../../../helpers/mastermind_replies_fixture.dart';

const _window = Duration(milliseconds: 60);
Future<void> _wait() => Future<void>.delayed(const Duration(milliseconds: 200));

void main() {
  late FakeReplyTransport transport;
  late MastermindRepliesCubit cubit;
  late SpyOutboxStore store;

  Future<void> start() async {
    transport = FakeReplyTransport(const [ReplyAccepted()]);
    store = SpyOutboxStore();
    cubit = repliesCubit(
      store: store,
      transport: transport,
      optionUndoWindow: _window,
    );
    await cubit.loadCapabilities();
    await cubit.ensureLoaded();
    addTearDown(cubit.close);
  }

  test('the default undo window is 30 seconds', () {
    expect(
      MastermindRepliesCubit.defaultOptionUndoWindow,
      const Duration(seconds: 30),
    );
  });

  test('undoAll cancels every held reply, clears the outbox and sends '
      'nothing', () async {
    await start();
    final a = parsedItem(inboxItem(1));
    final b = parsedItem(inboxItem(2));
    cubit
      ..queueOption(item: a, optionIndex: 0)
      ..queueOption(item: b, optionIndex: 1);
    expect(cubit.state.heldEntries(cubit.now()), hasLength(2));
    expect(cubit.state.earliestHoldUntil(cubit.now()), isNotNull);
    expect(cubit.undoAll(), 2);
    await Future<void>.delayed(Duration.zero);
    expect(cubit.state.heldEntries(cubit.now()), isEmpty);
    expect(cubit.state.earliestHoldUntil(cubit.now()), isNull);
    expect(cubit.state.outbox, isEmpty);
    expect(await store.inner.read(), isEmpty);
    await _wait();
    expect(transport.sent, isEmpty);
    expect(cubit.undoAll(), 0);
  });

  test('undoAll leaves an already committed reply alone', () async {
    await start();
    final a = parsedItem(inboxItem(1));
    cubit.queueOption(item: a, optionIndex: 0);
    await _wait();
    expect(transport.sent, hasLength(1));
    final b = parsedItem(inboxItem(2));
    cubit.queueOption(item: b, optionIndex: 0);
    expect(cubit.undoAll(), 1);
    await _wait();
    expect(transport.sent, hasLength(1));
    expect(cubit.state.outbox.single.itemId, a.id);
  });

  test('an ask that expires during the hold is never sent', () async {
    await start();
    final item = parsedItem(inboxItem(1));
    cubit
      ..queueOption(item: item, optionIndex: 0)
      // A live snapshot arrives mid-hold without the item (answered elsewhere).
      ..syncSnapshot(readySnapshot(inboxJson(const [])));
    await _wait();
    expect(transport.sent, isEmpty);
    expect(cubit.state.outbox, isEmpty);
    expect(cubit.state.heldEntries(cubit.now()), isEmpty);
  });

  test('a surviving hold keeps its idempotency key through the send', () async {
    await start();
    cubit.queueOption(item: parsedItem(inboxItem(1)), optionIndex: 0);
    final key = cubit.state.outbox.single.idempotencyKey;
    await _wait();
    expect(transport.sent.single.idempotencyKey, key);
  });
}

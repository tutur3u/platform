import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';

import '../../../helpers/mastermind_replies_fixture.dart';

const _window = Duration(milliseconds: 40);
const _after = Duration(milliseconds: 150);

Future<void> _wait() => Future<void>.delayed(_after);

NeedsYou _item() => parsedItem(inboxItem(1));

void main() {
  late FakeReplyTransport transport;
  late MastermindRepliesCubit cubit;
  late SpyOutboxStore store;

  Future<void> start(List<ReplyOutcome> outcomes) async {
    transport = FakeReplyTransport(outcomes);
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

  test('a tap persists a held reply before the undo window ends', () async {
    await start(const [ReplyAccepted()]);
    final item = _item();
    expect(cubit.queueOption(item: item, optionIndex: 0), isTrue);
    expect(cubit.state.outbox.single.holdUntil, isNotNull);
    expect(transport.sent, isEmpty);
    expect(
      cubit.state.pendingOptionFor(item.id, item.versionHash)?.option,
      'Approve',
    );
    await Future<void>.delayed(Duration.zero);
    expect((await store.inner.read()).single.holdUntil, isNotNull);
    await _wait();
    expect(transport.sent, hasLength(1));
    expect(cubit.state.outbox, hasLength(1));
    expect(transport.sent.single.optionIndex, 0);
    expect(cubit.state.pendingOptions, isEmpty);
  });

  test('relaunch sends a persisted held reply after its deadline', () async {
    var now = DateTime.utc(2026, 1, 31, 17, 32);
    final store = SpyOutboxStore();
    final transport = FakeReplyTransport();
    final original = repliesCubit(
      store: store,
      transport: transport,
      clock: () => now,
      optionUndoWindow: const Duration(minutes: 5),
    );
    await original.loadCapabilities();
    await original.ensureLoaded();
    expect(original.queueOption(item: _item(), optionIndex: 0), isTrue);
    await Future<void>.delayed(Duration.zero);
    expect((await store.inner.read()).single.holdUntil, isNotNull);
    await original.close(); // Simulate the OS killing the process.

    now = now.add(const Duration(minutes: 6));
    final relaunched = repliesCubit(
      store: store,
      transport: transport,
      clock: () => now,
    );
    await relaunched.loadCapabilities();
    await relaunched.flush();
    expect(transport.sent, hasLength(1));
    expect(transport.sent.single.optionIndex, 0);
    await relaunched.close();
  });

  test('background flush sends immediately during the undo window', () async {
    final item = _item();
    await start(const [ReplyAccepted()]);
    expect(cubit.queueOption(item: item, optionIndex: 1), isTrue);
    await Future<void>.delayed(Duration.zero);
    expect(transport.sent, isEmpty);
    await cubit.flushOnBackground();
    expect(transport.sent, hasLength(1));
    expect(transport.sent.single.optionIndex, 1);
  });

  test('undo inside the window sends nothing and the item can be picked '
      'again', () async {
    await start(const [ReplyAccepted()]);
    final item = _item();
    cubit
      ..queueOption(item: item, optionIndex: 0)
      ..undoOption(item.id);
    expect(cubit.state.pendingOptions, isEmpty);
    await _wait();
    expect(transport.sent, isEmpty);
    expect(cubit.state.outbox, isEmpty);
    expect(await store.inner.read(), isEmpty);
    expect(cubit.queueOption(item: item, optionIndex: 1), isTrue);
    await _wait();
    expect(transport.sent.single.optionIndex, 1);
  });

  test('a second tap inside the window does not double-queue', () async {
    await start(const [ReplyAccepted()]);
    final item = _item();
    expect(cubit.queueOption(item: item, optionIndex: 0), isTrue);
    expect(cubit.queueOption(item: item, optionIndex: 1), isFalse);
    expect(cubit.queueOption(item: item, optionIndex: 0), isFalse);
    await _wait();
    expect(transport.sent, hasLength(1));
    expect(cubit.state.outbox, hasLength(1));
    // Once queued, the item takes no further option tap.
    expect(cubit.queueOption(item: item, optionIndex: 0), isFalse);
    await _wait();
    expect(transport.sent, hasLength(1));
  });

  test('the queued reply retries with its own idempotency key', () async {
    await start(const [ReplyUnavailable(), ReplyAccepted()]);
    final item = _item();
    cubit.queueOption(item: item, optionIndex: 0);
    await _wait();
    final first = transport.sent.single;
    expect(first.idempotencyKey, isNotEmpty);
    await cubit.retry(item.id, item.versionHash);
    expect(transport.sent, hasLength(2));
    expect(transport.sent.last.idempotencyKey, first.idempotencyKey);
  });

  test('undo after the window has ended does nothing', () async {
    await start(const [ReplyAccepted()]);
    final item = _item();
    cubit.queueOption(item: item, optionIndex: 0);
    await _wait();
    cubit.undoOption(item.id);
    expect(cubit.state.outbox, hasLength(1));
    expect(transport.sent, hasLength(1));
  });

  test('no window for a placeholder, a bad index or replies off', () async {
    await start(const [ReplyAccepted()]);
    final mac = parsedItem(inboxItem(2, options: ['Reply on Mac']));
    expect(cubit.queueOption(item: mac, optionIndex: 0), isFalse);
    expect(cubit.queueOption(item: _item(), optionIndex: 9), isFalse);
    expect(cubit.queueOption(item: _item(), optionIndex: -1), isFalse);
    final off = repliesCubit(
      transport: transport,
      fetchCapabilities: capabilities(replies: false),
    );
    await off.loadCapabilities();
    expect(off.queueOption(item: _item(), optionIndex: 0), isFalse);
    await off.close();
  });

  test('clear (logout) cancels a window rather than send to the next '
      'account', () async {
    await start(const [ReplyAccepted()]);
    cubit.queueOption(item: _item(), optionIndex: 0);
    await cubit.clear();
    expect(cubit.state.pendingOptions, isEmpty);
    await _wait();
    expect(transport.sent, isEmpty);
  });
}

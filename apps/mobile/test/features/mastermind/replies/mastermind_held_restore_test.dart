import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';

import '../../../helpers/mastermind_replies_fixture.dart';

final _t0 = DateTime.utc(2026, 1, 31, 17, 32);

OutboxEntry _held(int n, {Duration hold = const Duration(seconds: 30)}) =>
    OutboxEntry(
      idempotencyKey: 'key-$n-${'k' * 20}',
      itemId: inboxItemId(n),
      versionHash: inboxHash('a'),
      createdAt: _t0,
      optionIndex: 0,
      optionLabel: 'Approve',
      holdUntil: _t0.add(hold),
    );

void main() {
  test(
    'count, countdown and Undo-all share one predicate, no timer needed',
    () {
      final state = MastermindRepliesState(outbox: [_held(1), _held(2)]);
      expect(state.heldEntries(_t0), hasLength(2));
      expect(
        state.earliestHoldUntil(_t0),
        _t0.add(const Duration(seconds: 30)),
      );
      final end = _t0.add(const Duration(seconds: 30));
      expect(state.heldEntries(end), isEmpty);
      expect(state.earliestHoldUntil(end), isNull);
      // A committed option is being sent: not undoable, not counted.
      final committed = MastermindRepliesState(
        outbox: [_held(1)],
        pendingOptions: {
          inboxItemId(1): PendingOptionReply(
            versionHash: inboxHash('a'),
            optionIndex: 0,
            option: 'Approve',
            committed: true,
          ),
        },
      );
      expect(committed.heldEntries(_t0), isEmpty);
    },
  );

  group('restored after a restart', () {
    late DateTime now;
    late SpyOutboxStore store;
    late FakeReplyTransport transport;
    late MastermindRepliesCubit cubit;

    setUp(() async {
      now = _t0;
      store = SpyOutboxStore();
      await store.inner.write([_held(1), _held(2)]);
      transport = FakeReplyTransport();
      cubit = repliesCubit(
        store: store,
        transport: transport,
        clock: () => now,
      );
      addTearDown(cubit.close);
      await cubit.loadCapabilities();
      await cubit.ensureLoaded();
    });

    test('holdUntil is honoured: never earlier, sends after', () async {
      await cubit.flush();
      expect(transport.sent, isEmpty);
      expect(cubit.state.heldEntries(now), hasLength(2));
      now = _t0.add(const Duration(seconds: 29));
      await cubit.flush();
      expect(transport.sent, isEmpty);
      now = _t0.add(const Duration(seconds: 31));
      await cubit.flush();
      expect(transport.sent, hasLength(2));
      expect(
        transport.sent.map((e) => e.idempotencyKey),
        containsAll(['key-1-${'k' * 20}', 'key-2-${'k' * 20}']),
      );
    });

    test(
      'stays undoable until then: Undo-all counts what it cancels',
      () async {
        now = _t0.add(const Duration(seconds: 10));
        final shown = cubit.state.heldEntries(now).length;
        expect(cubit.undoAll(), shown);
        expect(shown, 2);
        await Future<void>.delayed(Duration.zero);
        expect(cubit.state.outbox, isEmpty);
        expect(await store.inner.read(), isEmpty);
        now = _t0.add(const Duration(seconds: 31));
        await cubit.flush();
        expect(transport.sent, isEmpty);
      },
    );
  });

  test('undoAll persists once for the whole batch', () async {
    final log = <String>[];
    final cubit = repliesCubit(
      store: SpyOutboxStore(log),
      transport: FakeReplyTransport(),
    );
    addTearDown(cubit.close);
    await cubit.loadCapabilities();
    await cubit.ensureLoaded();
    for (final n in [1, 2, 3]) {
      cubit.queueOption(item: parsedItem(inboxItem(n)), optionIndex: 0);
    }
    await Future<void>.delayed(const Duration(milliseconds: 20));
    log.clear();
    expect(cubit.undoAll(), 3);
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(log, ['write:0']);
  });
}

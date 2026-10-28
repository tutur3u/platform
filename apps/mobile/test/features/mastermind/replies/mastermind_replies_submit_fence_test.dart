import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/replies/reply_outbox_store.dart';

import '../../../helpers/mastermind_replies_fixture.dart';

final NeedsYou _item = parsedItem(inboxItem(1));

/// An outbox whose first read waits for [readGate], like a slow disk.
final class _SlowReadStore implements MastermindOutboxStore {
  final readGate = Completer<void>();
  final inner = MemoryOutboxStore();

  @override
  Future<List<OutboxEntry>> read() async {
    await readGate.future;
    return await inner.read();
  }

  @override
  Future<void> write(List<OutboxEntry> entries) => inner.write(entries);

  @override
  Future<void> clear() => inner.clear();
}

void main() {
  group('submit across a logout', () {
    test('a logout during the first outbox read queues nothing for the next '
        'account', () async {
      final store = _SlowReadStore();
      final transport = FakeReplyTransport();
      final cubit = repliesCubit(store: store, transport: transport);
      addTearDown(cubit.close);
      await cubit.loadCapabilities();

      final submitting = cubit.submit(item: _item, text: 'Hello');
      await pumpEventQueue();

      await cubit.clear();
      store.readGate.complete();

      expect(await submitting, isFalse);
      expect(cubit.state.outbox, isEmpty);
      expect(cubit.state.statuses, isEmpty);
      expect(transport.sent, isEmpty);
      expect(await store.inner.read(), isEmpty);
    });

    test('a logout during the capability check also queues nothing', () async {
      final store = SpyOutboxStore();
      final transport = FakeReplyTransport();
      final gate = Completer<void>();
      final cubit = repliesCubit(
        store: store,
        transport: transport,
        fetchCapabilities: () async {
          await gate.future;
          return await capabilities()();
        },
      );
      addTearDown(cubit.close);

      final submitting = cubit.submit(item: _item, text: 'Hello');
      await pumpEventQueue();

      await cubit.clear();
      gate.complete();

      expect(await submitting, isFalse);
      expect(cubit.state.outbox, isEmpty);
      expect(transport.sent, isEmpty);
      expect(await store.inner.read(), isEmpty);
    });
  });
}

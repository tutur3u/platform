import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';

import '../../../helpers/mastermind_replies_fixture.dart';

final NeedsYou _item = parsedItem(inboxItem(1));

void main() {
  group('replies gate in code', () {
    test('a reconnect flush with replies:false sends nothing', () async {
      var on = true;
      final transport = FakeReplyTransport(const [
        ReplyUnavailable(),
        ReplyAccepted(),
      ]);
      final store = SpyOutboxStore();
      final cubit = repliesCubit(
        store: store,
        transport: transport,
        fetchCapabilities: () => capabilities(replies: on)(),
      );
      addTearDown(cubit.close);
      await cubit.loadCapabilities();
      expect(await cubit.submit(item: _item, text: 'Hello'), isTrue);
      expect(transport.sent, hasLength(1));

      on = false;
      await cubit.flush(recheckCapabilities: true);
      expect(transport.sent, hasLength(1));
      expect(cubit.state.capability, ReplyCapability.unsupported);
      // Queued, so neither sent nor dropped.
      expect(cubit.state.pendingCount, 1);
      expect((await store.inner.read()).single.status, OutboxStatus.pending);

      on = true;
      await cubit.flush(recheckCapabilities: true);
      expect(transport.sent, hasLength(2));
      expect(cubit.state.pendingCount, 0);
    });

    test(
      'a queued entry from an earlier session waits while replies are off',
      () async {
        final store = SpyOutboxStore();
        await store.inner.write([
          OutboxEntry(
            idempotencyKey: '00000000-0000-4000-8000-000000000001',
            itemId: _item.id,
            versionHash: _item.versionHash,
            createdAt: DateTime.utc(2026, 1, 31, 17),
            text: 'Hello',
          ),
        ]);
        final transport = FakeReplyTransport();
        final cubit = repliesCubit(
          store: store,
          transport: transport,
          fetchCapabilities: capabilities(replies: false),
        );
        addTearDown(cubit.close);
        await cubit.flush();
        expect(transport.sent, isEmpty);
        expect(cubit.state.pendingCount, 1);
        expect(await store.inner.read(), hasLength(1));
      },
    );

    test('submit and retry send nothing while replies are off', () async {
      var on = true;
      final transport = FakeReplyTransport(const [ReplyUnavailable()]);
      final cubit = repliesCubit(
        transport: transport,
        fetchCapabilities: () => capabilities(replies: on)(),
      );
      addTearDown(cubit.close);
      await cubit.loadCapabilities();
      await cubit.submit(item: _item, text: 'Hello');
      expect(transport.sent, hasLength(1));

      on = false;
      await cubit.loadCapabilities(force: true);
      await cubit.retry(_item.id, _item.versionHash);
      expect(transport.sent, hasLength(1));
      expect(cubit.state.pendingCount, 1);

      final other = parsedItem(inboxItem(2));
      expect(await cubit.submit(item: other, text: 'Hi'), isFalse);
      expect(transport.sent, hasLength(1));
      expect(cubit.state.outbox, hasLength(1));
    });
  });

  group('logout racing a refused reply', () {
    for (final disabled in [false, true]) {
      test('403 (disabled: $disabled) is not acted on after clear', () async {
        final lost = <SnapshotUnavailableKind>[];
        final store = SpyOutboxStore();
        final transport = FakeReplyTransport([
          ReplyForbidden(disabled: disabled),
        ])..gate = Completer<void>();
        final cubit = repliesCubit(
          store: store,
          transport: transport,
          onAccessLost: (kind) async => lost.add(kind),
        );
        addTearDown(cubit.close);
        await cubit.loadCapabilities();
        final submitting = cubit.submit(item: _item, optionIndex: 1);
        await pumpEventQueue();
        expect(transport.sent, hasLength(1));

        // The drop of the refused entry is waiting on the disk when the user
        // logs out: the new session must not be told access was lost.
        store.writeGate = Completer<void>();
        transport.gate!.complete();
        await pumpEventQueue();
        final cleared = cubit.clear();
        store.writeGate!.complete();
        await Future.wait([submitting, cleared]);

        expect(lost, isEmpty);
        expect(cubit.state.capability, ReplyCapability.unknown);
      });
    }
  });

  group('entry binding', () {
    OutboxEntry entry(String hash, String text) => OutboxEntry(
      idempotencyKey:
          '00000000-0000-4000-8000-00000000000${hash == 'a' ? 1 : 2}',
      itemId: _item.id,
      versionHash: inboxHash(hash),
      createdAt: DateTime.utc(2026, 1, 31, 17),
      text: text,
    );

    test('entryFor matches the item id AND the version hash', () {
      final old = entry('b', 'old');
      final current = entry('a', 'current');
      final state = MastermindRepliesState(outbox: [old, current]);
      expect(state.entryFor(_item.id, inboxHash('a')), same(current));
      expect(state.entryFor(_item.id, inboxHash('b')), same(old));
      expect(state.entryFor(_item.id, inboxHash('c')), isNull);
      expect(state.entryFor(inboxItemId(9), inboxHash('a')), isNull);
    });

    // The current version comes first: matching on the item id alone would
    // find it before the old one.
    for (final discarded in ['a', 'b']) {
      test('discard of version $discarded removes only that entry', () async {
        final store = SpyOutboxStore();
        await store.inner.write([entry('a', 'current'), entry('b', 'old')]);
        final cubit = repliesCubit(
          store: store,
          transport: FakeReplyTransport(const [ReplyUnavailable()]),
        );
        addTearDown(cubit.close);
        await cubit.ensureLoaded();
        await cubit.discard(_item.id, inboxHash(discarded));

        final kept = discarded == 'a' ? 'b' : 'a';
        expect(cubit.state.outbox.single.versionHash, inboxHash(kept));
        expect((await store.inner.read()).single.versionHash, inboxHash(kept));
      });
    }
  });

  group('logout racing a stale reply', () {
    test('does not refresh the snapshot or keep the words', () async {
      var refreshed = 0;
      final store = SpyOutboxStore();
      final transport = FakeReplyTransport(const [ReplyStale()])
        ..gate = Completer<void>();
      final cubit = repliesCubit(
        store: store,
        transport: transport,
        refreshSnapshot: () async => refreshed++,
      );
      addTearDown(cubit.close);
      await cubit.loadCapabilities();
      final submitting = cubit.submit(item: _item, text: 'Please wait');
      await pumpEventQueue();
      expect(transport.sent, hasLength(1));

      // The drop of the stale entry is waiting on the disk when the user logs
      // out: the new session must not be refreshed for the old one's 409.
      store.writeGate = Completer<void>();
      transport.gate!.complete();
      await pumpEventQueue();
      final cleared = cubit.clear();
      store.writeGate!.complete();
      await Future.wait([submitting, cleared]);

      expect(refreshed, 0);
      expect(cubit.draftFor(_item.id).isEmpty, isTrue);
      expect(cubit.state.outbox, isEmpty);
    });
  });
}

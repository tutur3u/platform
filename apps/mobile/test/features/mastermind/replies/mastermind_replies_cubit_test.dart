import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/data/hub_capabilities.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';

import '../../../helpers/mastermind_replies_fixture.dart';

final NeedsYou _item = parsedItem(inboxItem(1));

void main() {
  group('capabilities gate', () {
    test('replies on and schema 1.4 means supported', () async {
      final cubit = repliesCubit();
      addTearDown(cubit.close);
      await cubit.loadCapabilities();
      expect(cubit.state.capability, ReplyCapability.supported);
      expect(cubit.state.canReply, isTrue);
    });

    test('replies off means unsupported: the composer stays hidden', () async {
      final cubit = repliesCubit(
        fetchCapabilities: capabilities(replies: false),
      );
      addTearDown(cubit.close);
      await cubit.loadCapabilities();
      expect(cubit.state.capability, ReplyCapability.unsupported);
      expect(cubit.state.canReply, isFalse);
    });

    test('a Worker without schema 1.4 is unsupported', () async {
      final cubit = repliesCubit(
        fetchCapabilities: capabilities(versions: const ['1.3']),
      );
      addTearDown(cubit.close);
      await cubit.loadCapabilities();
      expect(cubit.state.capability, ReplyCapability.unsupported);
    });

    test('no capabilities source (fixture build) is unsupported', () async {
      final cubit = MastermindRepliesCubit(store: SpyOutboxStore());
      addTearDown(cubit.close);
      await cubit.loadCapabilities();
      expect(cubit.state.capability, ReplyCapability.unsupported);
    });

    test('an unreachable hub is unavailable, not unsupported', () async {
      final cubit = repliesCubit(
        fetchCapabilities: () async => const CapabilitiesFetchUnavailable(
          SnapshotUnavailableKind.unavailable,
        ),
      );
      addTearDown(cubit.close);
      await cubit.loadCapabilities();
      expect(cubit.state.capability, ReplyCapability.unavailable);
    });

    test('a failed re-check never flips a known answer', () async {
      var fail = false;
      final cubit = repliesCubit(
        fetchCapabilities: () async => fail
            ? const CapabilitiesFetchUnavailable(
                SnapshotUnavailableKind.unavailable,
              )
            : CapabilitiesFetchOk(
                MastermindCapabilities(
                  schemaVersions: const ['1.4'],
                  replies: true,
                  push: false,
                ),
              ),
      );
      addTearDown(cubit.close);
      await cubit.loadCapabilities();
      fail = true;
      await cubit.loadCapabilities(force: true);
      expect(cubit.state.capability, ReplyCapability.supported);
    });

    test(
      'a known answer is reused for five minutes, then asked again',
      () async {
        var now = DateTime.utc(2026, 1, 31, 17);
        var asked = 0;
        final cubit = repliesCubit(
          clock: () => now,
          fetchCapabilities: () {
            asked++;
            return capabilities()();
          },
        );
        addTearDown(cubit.close);
        await cubit.loadCapabilities();
        await cubit.loadCapabilities();
        expect(asked, 1);
        now = now.add(const Duration(minutes: 6));
        await cubit.loadCapabilities();
        expect(asked, 2);
      },
    );

    test('401 or 403 on capabilities is access lost', () async {
      for (final kind in [
        SnapshotUnavailableKind.unauthorized,
        SnapshotUnavailableKind.forbidden,
      ]) {
        final lost = <SnapshotUnavailableKind>[];
        final cubit = repliesCubit(
          fetchCapabilities: () async => CapabilitiesFetchUnavailable(kind),
          onAccessLost: (k) async => lost.add(k),
        );
        await cubit.loadCapabilities();
        expect(lost, [kind]);
        await cubit.close();
      }
    });
  });

  group('sending', () {
    test('the reply is persisted with its key BEFORE the first send', () async {
      final log = <String>[];
      final store = SpyOutboxStore(log);
      final transport = FakeReplyTransport(const [ReplyAccepted()], log);
      final cubit = repliesCubit(store: store, transport: transport);
      addTearDown(cubit.close);
      expect(await cubit.submit(item: _item, optionIndex: 1), isTrue);
      expect(log, ['write:1', 'send', 'write:1']);
      final stored = (await store.inner.read()).single;
      expect(stored.idempotencyKey, transport.sent.single.idempotencyKey);
      expect(stored.status, OutboxStatus.sent);
    });

    test('a failed disk write means nothing is sent', () async {
      final store = SpyOutboxStore()..failWrites = true;
      final transport = FakeReplyTransport();
      final cubit = repliesCubit(store: store, transport: transport);
      addTearDown(cubit.close);
      expect(await cubit.submit(item: _item, optionIndex: 0), isFalse);
      expect(transport.sent, isEmpty);
      expect(cubit.state.outbox, isEmpty);
      expect(cubit.state.statusFor(_item.id).issue, ReplyIssue.notSaved);
    });

    test('an option reply sends the item option_index and version', () async {
      final transport = FakeReplyTransport();
      final cubit = repliesCubit(transport: transport);
      addTearDown(cubit.close);
      await cubit.submit(item: _item, optionIndex: 1);
      expect(transport.sent.single.toRequestJson(), {
        'schema_version': '1.4',
        'item_id': _item.id,
        'version_hash': _item.versionHash,
        'option_index': 1,
      });
    });

    test('a text reply is trimmed and sent without option_index', () async {
      final transport = FakeReplyTransport();
      final cubit = repliesCubit(transport: transport);
      addTearDown(cubit.close);
      await cubit.submit(item: _item, text: '  Ship it.  ');
      expect(transport.sent.single.toRequestJson().keys, [
        'schema_version',
        'item_id',
        'version_hash',
        'text',
      ]);
      expect(transport.sent.single.text, 'Ship it.');
    });

    test('201 and a 200 replay are the same: the reply is sent', () async {
      for (final outcome in [
        const ReplyAccepted(),
        const ReplyAccepted(replayed: true),
      ]) {
        final cubit = repliesCubit(transport: FakeReplyTransport([outcome]));
        await cubit.submit(item: _item, optionIndex: 0);
        expect(cubit.state.outbox.single.status, OutboxStatus.sent);
        expect(cubit.state.statusFor(_item.id).issue, isNull);
        expect(cubit.state.pendingCount, 0);
        await cubit.close();
      }
    });

    test('rejects what the hub would refuse, without sending', () async {
      final transport = FakeReplyTransport();
      final placeholder = parsedItem(
        inboxItem(2, options: const ['Reply on Mac'], recommended: null),
      );
      final cubit = repliesCubit(transport: transport);
      addTearDown(cubit.close);
      expect(await cubit.submit(item: _item), isFalse);
      expect(
        await cubit.submit(item: _item, optionIndex: 0, text: 'x'),
        isFalse,
      );
      expect(await cubit.submit(item: _item, optionIndex: 5), isFalse);
      expect(await cubit.submit(item: _item, optionIndex: -1), isFalse);
      expect(await cubit.submit(item: _item, text: '   '), isFalse);
      expect(await cubit.submit(item: _item, text: 'a' * 501), isFalse);
      expect(await cubit.submit(item: placeholder, optionIndex: 0), isFalse);
      expect(transport.sent, isEmpty);
      // Free text is still allowed on a placeholder-only item.
      expect(await cubit.submit(item: placeholder, text: 'On it'), isTrue);
    });

    test('a second reply for the same question version is refused', () async {
      final transport = FakeReplyTransport(const [ReplyUnavailable()]);
      final cubit = repliesCubit(transport: transport);
      addTearDown(cubit.close);
      await cubit.submit(item: _item, optionIndex: 0);
      expect(await cubit.submit(item: _item, optionIndex: 1), isFalse);
      expect(transport.sent, hasLength(1));
    });
  });

  group('idempotent retry', () {
    test('a retry after an unknown outcome reuses the same key', () async {
      final transport = FakeReplyTransport(const [
        ReplyUnavailable(),
        ReplyUnavailable(),
        ReplyAccepted(replayed: true),
      ]);
      final cubit = repliesCubit(transport: transport);
      addTearDown(cubit.close);
      await cubit.submit(item: _item, optionIndex: 0);
      expect(cubit.state.statusFor(_item.id).issue, ReplyIssue.offline);
      expect(cubit.state.pendingCount, 1);
      await cubit.retry(_item.id, _item.versionHash);
      await cubit.retry(_item.id, _item.versionHash);
      final keys = transport.sent.map((e) => e.idempotencyKey).toSet();
      expect(transport.sent, hasLength(3));
      expect(keys, hasLength(1));
      expect(cubit.state.outbox.single.status, OutboxStatus.sent);
    });

    test(
      'a queued reply survives a restart and is flushed with its key',
      () async {
        final store = SpyOutboxStore();
        final first = FakeReplyTransport(const [ReplyUnavailable()]);
        final before = repliesCubit(store: store, transport: first);
        await before.submit(item: _item, optionIndex: 1);
        await before.close();

        final second = FakeReplyTransport();
        final after = repliesCubit(store: store, transport: second);
        addTearDown(after.close);
        await after.flush();
        expect(second.sent, hasLength(1));
        expect(
          second.sent.single.idempotencyKey,
          first.sent.single.idempotencyKey,
        );
        expect(after.state.outbox.single.status, OutboxStatus.sent);
      },
    );

    test('flush sends only queued replies, never sent ones', () async {
      final transport = FakeReplyTransport();
      final cubit = repliesCubit(transport: transport);
      addTearDown(cubit.close);
      await cubit.submit(item: _item, optionIndex: 0);
      await cubit.flush();
      await cubit.flush();
      expect(transport.sent, hasLength(1));
    });

    test('the same send is never in flight twice', () async {
      final transport = FakeReplyTransport(const [ReplyUnavailable()]);
      final cubit = repliesCubit(transport: transport);
      addTearDown(cubit.close);
      await cubit.submit(item: _item, optionIndex: 0);
      transport.gate = Completer<void>();
      final first = cubit.retry(_item.id, _item.versionHash);
      final second = cubit.retry(_item.id, _item.versionHash);
      transport.gate!.complete();
      await Future.wait([first, second]);
      expect(transport.sent, hasLength(2));
    });
  });

  group('409 stale_item', () {
    test('refreshes the item and keeps the draft', () async {
      var refreshed = 0;
      final transport = FakeReplyTransport(const [ReplyStale()]);
      final cubit = repliesCubit(
        transport: transport,
        refreshSnapshot: () async => refreshed++,
      );
      addTearDown(cubit.close);
      cubit.saveDraft(
        _item.id,
        const ReplyDraft(optionIndex: 1, optionLabel: 'Defer'),
      );
      await cubit.submit(item: _item, optionIndex: 1);
      expect(refreshed, 1);
      expect(cubit.state.outbox, isEmpty);
      expect(cubit.state.statusFor(_item.id).issue, ReplyIssue.stale);
      expect(cubit.draftFor(_item.id).optionIndex, 1);
      expect(cubit.draftFor(_item.id).optionLabel, 'Defer');
    });

    test('a queued reply that goes stale becomes a draft', () async {
      final store = SpyOutboxStore();
      final before = repliesCubit(
        store: store,
        transport: FakeReplyTransport(const [ReplyUnavailable()]),
      );
      await before.submit(item: _item, text: 'Please wait');
      await before.close();

      final after = repliesCubit(
        store: store,
        transport: FakeReplyTransport(const [ReplyStale()]),
      );
      addTearDown(after.close);
      await after.flush();
      expect(after.state.outbox, isEmpty);
      expect(after.draftFor(_item.id).text, 'Please wait');
      expect(await store.inner.read(), isEmpty);
    });

    test('the dropped entry is not persisted again', () async {
      final store = SpyOutboxStore();
      final cubit = repliesCubit(
        store: store,
        transport: FakeReplyTransport(const [ReplyStale()]),
      );
      addTearDown(cubit.close);
      await cubit.submit(item: _item, optionIndex: 0);
      expect(await store.inner.read(), isEmpty);
    });
  });

  group('error handling', () {
    Future<MastermindRepliesCubit> failWith(
      ReplyOutcome outcome, {
      AccessLostCallback? onAccessLost,
      DateTime Function()? clock,
    }) async {
      final cubit = repliesCubit(
        transport: FakeReplyTransport([outcome]),
        onAccessLost: onAccessLost,
        clock: clock,
      );
      addTearDown(cubit.close);
      await cubit.submit(item: _item, text: 'Hello');
      return cubit;
    }

    test('400 drops the reply but keeps the words to edit', () async {
      final cubit = repliesCubit(
        transport: FakeReplyTransport(const [ReplyRejected()]),
      );
      addTearDown(cubit.close);
      cubit.saveDraft(_item.id, const ReplyDraft(text: 'Hello'));
      await cubit.submit(item: _item, text: 'Hello');
      expect(cubit.state.statusFor(_item.id).issue, ReplyIssue.rejected);
      expect(cubit.state.outbox, isEmpty);
      expect(cubit.draftFor(_item.id).text, 'Hello');
    });

    test('400 unsafe_text is its own issue', () async {
      final cubit = await failWith(const ReplyRejected(unsafeText: true));
      expect(cubit.state.statusFor(_item.id).issue, ReplyIssue.unsafeText);
    });

    test('413 is a local length error', () async {
      final cubit = await failWith(const ReplyTooLarge());
      expect(cubit.state.statusFor(_item.id).issue, ReplyIssue.tooLarge);
      expect(cubit.state.outbox, isEmpty);
    });

    test('409 idempotency_conflict drops the entry', () async {
      final cubit = await failWith(const ReplyKeyConflict());
      expect(cubit.state.statusFor(_item.id).issue, ReplyIssue.conflict);
      expect(cubit.state.outbox, isEmpty);
    });

    test('403 replies_disabled turns replies off', () async {
      final cubit = await failWith(const ReplyForbidden(disabled: true));
      expect(cubit.state.capability, ReplyCapability.unsupported);
      expect(cubit.state.outbox, isEmpty);
      expect(cubit.state.statusFor(_item.id).issue, ReplyIssue.forbidden);
    });

    test('403 forbidden is access lost', () async {
      final lost = <SnapshotUnavailableKind>[];
      final cubit = await failWith(
        const ReplyForbidden(disabled: false),
        onAccessLost: (kind) async => lost.add(kind),
      );
      expect(lost, [SnapshotUnavailableKind.forbidden]);
      expect(cubit.state.outbox, isEmpty);
    });

    test('429 waits out Retry-After and keeps the queued reply', () async {
      var now = DateTime.utc(2026, 1, 31, 17);
      final transport = FakeReplyTransport(const [
        ReplyRateLimited(retryAfter: Duration(minutes: 3)),
        ReplyAccepted(),
      ]);
      final cubit = repliesCubit(clock: () => now, transport: transport);
      addTearDown(cubit.close);
      await cubit.submit(item: _item, text: 'Hello');
      final status = cubit.state.statusFor(_item.id);
      expect(status.issue, ReplyIssue.rateLimited);
      expect(status.retryAt, now.add(const Duration(minutes: 3)));
      expect(cubit.state.pendingCount, 1);

      await cubit.retry(_item.id, _item.versionHash);
      await cubit.flush();
      expect(transport.sent, hasLength(1), reason: 'still rate limited');

      now = now.add(const Duration(minutes: 3, seconds: 1));
      await cubit.retry(_item.id, _item.versionHash);
      expect(transport.sent, hasLength(2));
      expect(transport.sent.map((e) => e.idempotencyKey).toSet(), hasLength(1));
    });

    test('429 without Retry-After waits a minute', () async {
      final now = DateTime.utc(2026, 1, 31, 17);
      final cubit = await failWith(const ReplyRateLimited(), clock: () => now);
      expect(
        cubit.state.statusFor(_item.id).retryAt,
        now.add(const Duration(minutes: 1)),
      );
    });

    test('401 keeps the reply: retry first, escalate on a repeat', () async {
      final transport = FakeReplyTransport(const [
        ReplyUnauthorized(),
        ReplyUnauthorized(),
        ReplyAccepted(),
      ]);
      final cubit = repliesCubit(transport: transport);
      addTearDown(cubit.close);
      await cubit.submit(item: _item, text: 'Hello');
      var status = cubit.state.statusFor(_item.id);
      expect(status.issue, ReplyIssue.unauthorized);
      expect(status.authFailures, 1);
      expect(cubit.state.pendingCount, 1);

      await cubit.retry(_item.id, _item.versionHash);
      status = cubit.state.statusFor(_item.id);
      expect(status.authFailures, 2);

      await cubit.retry(_item.id, _item.versionHash);
      expect(cubit.state.outbox.single.status, OutboxStatus.sent);
      expect(cubit.state.statusFor(_item.id).issue, isNull);
      expect(transport.sent.map((e) => e.idempotencyKey).toSet(), hasLength(1));
    });

    test('flush does not hammer a refused session', () async {
      final transport = FakeReplyTransport(const [ReplyUnauthorized()]);
      final cubit = repliesCubit(transport: transport);
      addTearDown(cubit.close);
      await cubit.submit(item: _item, text: 'Hello');
      await cubit.flush();
      await cubit.flush();
      expect(transport.sent, hasLength(1));
    });

    test('a network failure keeps the reply queued', () async {
      final cubit = await failWith(const ReplyUnavailable());
      expect(cubit.state.statusFor(_item.id).issue, ReplyIssue.offline);
      expect(cubit.state.pendingCount, 1);
    });

    test('discard removes a queued reply for good', () async {
      final store = SpyOutboxStore();
      final cubit = repliesCubit(
        store: store,
        transport: FakeReplyTransport(const [ReplyUnavailable()]),
      );
      addTearDown(cubit.close);
      await cubit.submit(item: _item, text: 'Hello');
      await cubit.discard(_item.id, _item.versionHash);
      expect(cubit.state.outbox, isEmpty);
      expect(await store.inner.read(), isEmpty);
    });

    test(
      'discard during flush prevents a stale outbox entry from sending',
      () async {
        final store = SpyOutboxStore();
        final transport = FakeReplyTransport(const [ReplyAccepted()])
          ..gate = Completer<void>();
        final first = OutboxEntry(
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
          itemId: inboxItemId(3),
          versionHash: inboxHash('a'),
          createdAt: DateTime.utc(2026, 1, 31, 17),
          text: 'First',
        );
        final second = OutboxEntry(
          idempotencyKey: '22222222-2222-4222-8222-222222222222',
          itemId: inboxItemId(4),
          versionHash: inboxHash('a'),
          createdAt: DateTime.utc(2026, 1, 31, 17),
          text: 'Second',
        );
        await store.inner.write([first, second]);
        final cubit = repliesCubit(store: store, transport: transport);
        addTearDown(cubit.close);
        await cubit.loadCapabilities();
        final flushing = cubit.flush();
        await Future<void>.delayed(Duration.zero);
        expect(transport.sent, [first]);
        await cubit.discard(second.itemId, second.versionHash);
        transport.gate!.complete();
        await flushing;
        expect(transport.sent.map((entry) => entry.itemId), [first.itemId]);
      },
    );
  });

  group('logout and account switch', () {
    test('clear erases memory and disk and resets the capability', () async {
      final store = SpyOutboxStore();
      final cubit = repliesCubit(
        store: store,
        transport: FakeReplyTransport(const [ReplyUnavailable()]),
      );
      addTearDown(cubit.close);
      await cubit.loadCapabilities();
      await cubit.submit(item: _item, text: 'Hello');
      cubit.saveDraft(_item.id, const ReplyDraft(text: 'draft'));

      await cubit.clear();
      expect(cubit.state.outbox, isEmpty);
      expect(cubit.state.capability, ReplyCapability.unknown);
      expect(cubit.state.loaded, isFalse);
      expect(cubit.draftFor(_item.id).isEmpty, isTrue);
      expect(await store.inner.read(), isEmpty);
    });

    test('a send in flight at logout cannot revive the outbox', () async {
      final store = SpyOutboxStore();
      final transport = FakeReplyTransport(const [ReplyUnavailable()]);
      final cubit = repliesCubit(store: store, transport: transport);
      addTearDown(cubit.close);
      await cubit.ensureLoaded();
      transport.gate = Completer<void>();
      final sending = cubit.submit(item: _item, text: 'Hello');
      await pumpEventQueue();
      expect(transport.sent, hasLength(1));

      await cubit.clear();
      transport.gate!.complete();
      await sending;
      expect(cubit.state.outbox, isEmpty);
      expect(cubit.state.statuses, isEmpty);
      expect(await store.inner.read(), isEmpty);
    });

    test('the next account starts with its own empty outbox', () async {
      final store = SpyOutboxStore();
      final cubit = repliesCubit(
        store: store,
        transport: FakeReplyTransport(const [ReplyUnavailable()]),
      );
      addTearDown(cubit.close);
      await cubit.submit(item: _item, text: 'Hello');
      await cubit.clear();
      await cubit.ensureLoaded();
      expect(cubit.state.loaded, isTrue);
      expect(cubit.state.outbox, isEmpty);
    });
  });

  group('snapshot sync', () {
    Future<MastermindRepliesCubit> queued(SpyOutboxStore store) async {
      final cubit = repliesCubit(
        store: store,
        transport: FakeReplyTransport(const [ReplyAccepted()]),
      );
      await cubit.submit(item: _item, optionIndex: 0);
      return cubit;
    }

    test('a sent reply stays while its question is still open', () async {
      final cubit = await queued(SpyOutboxStore());
      addTearDown(cubit.close);
      cubit.syncSnapshot(readySnapshot(inboxJson([inboxItem(1)])));
      expect(cubit.state.outbox, hasLength(1));
    });

    test('it is pruned once the item leaves a live snapshot', () async {
      final store = SpyOutboxStore();
      final cubit = await queued(store);
      addTearDown(cubit.close);
      cubit.syncSnapshot(readySnapshot(inboxJson([inboxItem(9)])));
      expect(cubit.state.outbox, isEmpty);
      await pumpEventQueue();
      expect(await store.inner.read(), isEmpty);
    });

    test('a cached snapshot never prunes', () async {
      final cubit = await queued(SpyOutboxStore());
      addTearDown(cubit.close);
      cubit.syncSnapshot(
        readySnapshot(inboxJson([inboxItem(9)]), origin: SnapshotOrigin.cache),
      );
      expect(cubit.state.outbox, hasLength(1));
    });

    test(
      'a sent reply to an older version is pruned when the hash moves',
      () async {
        final cubit = await queued(SpyOutboxStore());
        addTearDown(cubit.close);
        cubit.syncSnapshot(readySnapshot(inboxJson([inboxItem(1, hash: 'b')])));
        expect(cubit.state.outbox, isEmpty);
      },
    );

    test(
      'a queued reply to a changed question waits for the hub to say',
      () async {
        final cubit = repliesCubit(
          transport: FakeReplyTransport(const [ReplyUnavailable()]),
        );
        addTearDown(cubit.close);
        await cubit.submit(item: _item, optionIndex: 0);
        cubit.syncSnapshot(readySnapshot(inboxJson([inboxItem(1, hash: 'b')])));
        expect(cubit.state.pendingCount, 1);
      },
    );

    test('a queued reply to an item that is gone is dropped', () async {
      final cubit = repliesCubit(
        transport: FakeReplyTransport(const [ReplyUnavailable()]),
      );
      addTearDown(cubit.close);
      await cubit.submit(item: _item, optionIndex: 0);
      cubit.syncSnapshot(readySnapshot(inboxJson([inboxItem(9)])));
      expect(cubit.state.outbox, isEmpty);
    });
  });

  test('item state of the parsed fixture is open', () {
    expect(_item.state, ItemState.open);
  });
}

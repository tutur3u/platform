import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/replies/answered_elsewhere_cubit.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';

import '../../../helpers/mastermind_replies_fixture.dart';

const _window = Duration(milliseconds: 40);
const _linger = Duration(milliseconds: 60);

Map<String, dynamic> _open() => inboxJson([inboxItem(1)]);

/// The same ask, now in the hub's resolved history.
Map<String, dynamic> _answered({String? via = 'mac', String hash = 'a'}) =>
    inboxJson([])
      ..['decisions_resolved'] = [
        {
          ...inboxItem(1, hash: hash),
          'status': 'resolved',
          'resolution': 'Approve',
          'resolved_at': '2026-01-31T17:31:00+00:00',
          'answered_via': ?via,
        },
      ];

void main() {
  late SpyOutboxStore store;
  late FakeReplyTransport transport;
  late MastermindAnsweredElsewhereCubit answered;
  late MastermindRepliesCubit replies;
  var refreshed = <String, dynamic>{};

  // What the runtime does with every snapshot, in its order.
  void deliver(
    Map<String, dynamic> json, {
    SnapshotOrigin origin = SnapshotOrigin.live,
  }) {
    final ready = readySnapshot(json, origin: origin);
    answered.observe(ready, replies.state);
    replies.syncSnapshot(ready);
  }

  Future<void> start(List<ReplyOutcome> outcomes) async {
    store = SpyOutboxStore();
    transport = FakeReplyTransport(outcomes);
    answered = MastermindAnsweredElsewhereCubit(linger: _linger);
    replies = repliesCubit(
      store: store,
      transport: transport,
      optionUndoWindow: _window,
      isAnsweredElsewhere: answered.isAnswered,
      refreshSnapshot: () async => deliver(refreshed),
    );
    addTearDown(replies.close);
    addTearDown(answered.close);
    await replies.loadCapabilities();
    await replies.ensureLoaded();
    deliver(_open());
  }

  test('an open ask answered on the Mac lingers, then moves on', () async {
    await start(const [ReplyAccepted()]);
    deliver(_answered());
    final entry = answered.state.values.single;
    expect(entry.item.id, inboxItemId(1));
    expect(entry.via, AnsweredVia.mac);
    expect(entry.option, 'Approve');
    expect(entry.cancelledReply, isFalse);
    await Future<void>.delayed(_linger * 2);
    expect(answered.state, isEmpty);
  });

  test('a reply still in its undo window is cancelled and deleted', () async {
    await start(const [ReplyAccepted()]);
    final item = parsedItem(inboxItem(1));
    expect(replies.queueOption(item: item, optionIndex: 0), isTrue);
    await Future<void>.delayed(Duration.zero);
    expect((await store.inner.read()).single.holdUntil, isNotNull);

    deliver(_answered());
    expect(answered.state.values.single.cancelledReply, isTrue);
    expect(replies.state.pendingOptions, isEmpty);
    expect(replies.state.outbox, isEmpty);
    await Future<void>.delayed(_window * 3);
    expect(await store.inner.read(), isEmpty);
    expect(transport.sent, isEmpty);
  });

  test('a 409 after sending shows the answer, never an error', () async {
    await start(const [ReplyStale()]);
    refreshed = _answered();
    final item = parsedItem(inboxItem(1));
    expect(await replies.submit(item: item, text: 'Ship it'), isTrue);
    expect(transport.sent, hasLength(1));
    expect(replies.state.statusFor(item.id).issue, isNull);
    expect(replies.state.statusFor(item.id).sending, isFalse);
    expect(replies.state.outbox, isEmpty);
    expect(replies.draftFor(item.id).isEmpty, isTrue);
    expect(answered.state[item.id]?.via, AnsweredVia.mac);
    expect(await store.inner.read(), isEmpty);
  });

  test('a 409 for a changed question is still stale', () async {
    await start(const [ReplyStale()]);
    refreshed = inboxJson([inboxItem(1, hash: 'b')]);
    final item = parsedItem(inboxItem(1));
    await replies.submit(item: item, text: 'Ship it');
    expect(replies.state.statusFor(item.id).issue, ReplyIssue.stale);
    expect(replies.draftFor(item.id).text, 'Ship it');
    expect(answered.state, isEmpty);
  });

  test('an ask this device answered is not answered elsewhere', () async {
    await start(const [ReplyAccepted()]);
    final item = parsedItem(inboxItem(1));
    await replies.submit(item: item, text: 'Ship it');
    expect(replies.state.outbox.single.status, OutboxStatus.sent);
    deliver(_answered(via: 'phone'));
    expect(answered.state, isEmpty);
  });

  test('withdrawn asks and cached snapshots never linger', () async {
    await start(const [ReplyAccepted()]);
    deliver(
      inboxJson([])
        ..['decisions_resolved'] = [
          {...inboxItem(1), 'status': 'withdrawn'},
        ],
    );
    expect(answered.state, isEmpty);

    deliver(_open());
    deliver(_answered(), origin: SnapshotOrigin.cache);
    expect(answered.state, isEmpty);
  });

  test('clear forgets lingering asks', () async {
    await start(const [ReplyAccepted()]);
    deliver(_answered(via: null));
    expect(answered.state.values.single.via, isNull);
    answered.clear();
    expect(answered.state, isEmpty);
    expect(answered.isAnswered(inboxItemId(1)), isFalse);
  });
}

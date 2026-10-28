import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';

import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

/// The outbox follows the snapshot cache: whatever erases one erases the other.
void main() {
  late SpyOutboxStore store;
  late MastermindViewHarness harness;

  setUp(() async {
    store = SpyOutboxStore();
    harness = MastermindViewHarness(
      source: FakeHubSource(bytes: snapshotBytes(inboxJson([inboxItem(1)]))),
      replies: repliesCubit(
        store: store,
        transport: FakeReplyTransport(const [ReplyUnavailable()]),
      ),
    );
    addTearDown(harness.dispose);
    await harness.snapshot.refresh();
    await harness.runtime.replies.submit(
      item: parsedItem(inboxItem(1)),
      text: 'Hello',
    );
    expect(harness.runtime.replies.state.pendingCount, 1);
    expect(await store.inner.read(), hasLength(1));
  });

  test('logout clears the outbox, memory and disk', () async {
    await harness.runtime.reset();
    expect(harness.runtime.replies.state.outbox, isEmpty);
    expect(harness.runtime.replies.state.loaded, isFalse);
    expect(await store.inner.read(), isEmpty);
  });

  test('an account switch clears the outbox too', () async {
    await harness.runtime.reset(wsId: 'other-workspace');
    expect(harness.runtime.replies.state.outbox, isEmpty);
    expect(await store.inner.read(), isEmpty);
  });

  test('access lost (403) clears the outbox with the snapshot', () async {
    harness.source.fetcher = () async =>
        const SnapshotFetch.unavailable(SnapshotUnavailableKind.forbidden);
    await harness.snapshot.refresh();
    await pumpEventQueue();
    expect(harness.runtime.replies.state.outbox, isEmpty);
    expect(await store.inner.read(), isEmpty);
  });

  test('losing access to the module clears the outbox', () async {
    await harness.setAccess(TestAccess.enabled);
    await harness.setAccess(TestAccess.disabled);
    await pumpEventQueue();
    expect(harness.runtime.replies.state.outbox, isEmpty);
  });

  test('a refresh that only fails to connect keeps the queue', () async {
    harness.source.fetcher = () async =>
        const SnapshotFetch.unavailable(SnapshotUnavailableKind.unavailable);
    await harness.snapshot.refresh();
    await pumpEventQueue();
    expect(harness.runtime.replies.state.pendingCount, 1);
  });

  test('a live snapshot without the item prunes its queued reply', () async {
    harness.source.bytes = snapshotBytes(inboxJson([inboxItem(2)]));
    await harness.snapshot.refresh();
    await pumpEventQueue();
    expect(harness.runtime.replies.state.outbox, isEmpty);
  });
}

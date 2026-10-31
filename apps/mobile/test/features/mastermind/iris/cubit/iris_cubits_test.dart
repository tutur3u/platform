import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/iris/cubit/iris_feed_cubit.dart';
import 'package:mobile/features/mastermind/iris/cubit/iris_send_cubit.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_models.dart';

import '../../../../helpers/mastermind_iris_fixture.dart';

ThreadMessage _message(int n, {String text = 'Synthetic'}) => ThreadMessage(
  ref: irisMsgRef(n),
  author: ThreadAuthor.agent,
  authorLabel: 'Atlas',
  createdAt: DateTime.utc(2026, 10, 31).add(Duration(minutes: n)),
  text: text,
  truncated: false,
  withheld: false,
  activity: null,
);

/// Scripted relay: each call pops the next queued answer.
final class _ScriptedRelay implements IrisRelay {
  final feeds = <IrisResult<IrisFeedPage>>[];
  final receipts = <IrisResult<IrisReceipt>>[];
  final feedCalls = <({String? before, String? after})>[];

  @override
  bool get isConfigured => true;

  @override
  Future<IrisResult<IrisFeedPage>> feed({
    String? before,
    String? after,
    int limit = 50,
  }) async {
    feedCalls.add((before: before, after: after));
    return feeds.removeAt(0);
  }

  @override
  Future<IrisResult<IrisReceipt>> send(
    String text, {
    required String idempotencyKey,
  }) async => const IrisOk(
    IrisReceipt(id: irisSendId, state: IrisReceiptState.received),
  );

  @override
  Future<IrisResult<IrisReceipt>> receipt(String id) async =>
      receipts.removeAt(0);

  static const _none = IrisErr<Never>(IrisFailure(IrisFailureKind.notFound));

  @override
  Future<IrisResult<IrisSummary>> summary() async => _none;

  @override
  Future<IrisResult<IrisEnrollment>> enroll(String k, String f) async => _none;

  @override
  Future<IrisResult<IrisDevice>> device(String id) async => _none;

  @override
  Future<IrisResult<List<IrisDevice>>> devices() async => _none;

  @override
  Future<IrisResult<void>> revoke(String id) async => _none;
}

void main() {
  testWidgets('a 404 cursor resets and reloads the latest page', (
    tester,
  ) async {
    final relay = _ScriptedRelay()
      ..feeds.addAll([
        IrisOk(IrisFeedPage(messages: [_message(1)], nextBefore: null)),
        const IrisErr(IrisFailure(IrisFailureKind.notFound)),
        IrisOk(IrisFeedPage(messages: [_message(7)], nextBefore: null)),
      ]);
    final feed = IrisFeedCubit(relay: relay)..start();
    await tester.pump();
    expect(feed.state.messages.single.ref, irisMsgRef(1));
    await tester.pump(const Duration(seconds: 15));
    await tester.pump();
    expect(relay.feedCalls.map((c) => c.after), [null, irisMsgRef(1), null]);
    expect(feed.state.messages.single.ref, irisMsgRef(7));
    await feed.close();
  });

  testWidgets('holds at most 500 messages in memory', (tester) async {
    final relay = _ScriptedRelay()
      ..feeds.add(
        IrisOk(
          IrisFeedPage(
            messages: [for (var i = 0; i < 520; i++) _message(i)],
            nextBefore: null,
          ),
        ),
      );
    final feed = IrisFeedCubit(relay: relay)..start();
    await tester.pump();
    expect(feed.state.messages, hasLength(IrisFeedCubit.maxMessages));
    expect(feed.state.messages.last.ref, irisMsgRef(519));
    feed.clear();
    expect(feed.state.messages, isEmpty);
    await feed.close();
  });

  testWidgets('receipts only move forward and stop at acked', (tester) async {
    final relay = _ScriptedRelay()
      ..receipts.addAll(const [
        IrisOk(
          IrisReceipt(
            id: irisSendId,
            state: IrisReceiptState.delivered,
            delivery: IrisDelivery.queue,
          ),
        ),
        // A stale read must not roll the row back.
        IrisOk(IrisReceipt(id: irisSendId, state: IrisReceiptState.received)),
        IrisOk(
          IrisReceipt(
            id: irisSendId,
            state: IrisReceiptState.acked,
            delivery: IrisDelivery.queue,
          ),
        ),
      ]);
    final send = IrisSendCubit(relay: relay)..send('hello');
    await tester.pump();
    expect(send.state.single.state, IrisReceiptState.received);
    await tester.pump(const Duration(seconds: 2));
    await tester.pump();
    expect(send.state.single.state, IrisReceiptState.delivered);
    expect(send.state.single.delivery, IrisDelivery.queue);
    await tester.pump(const Duration(seconds: 4));
    await tester.pump();
    expect(send.state.single.state, IrisReceiptState.delivered);
    await tester.pump(const Duration(seconds: 8));
    await tester.pump();
    expect(send.state.single.state, IrisReceiptState.acked);
    expect(relay.receipts, isEmpty);

    // The feed's copy replaces the optimistic row.
    send.reconcile([
      ThreadMessage(
        ref: irisMsgRef(99),
        author: ThreadAuthor.ownerPhone,
        authorLabel: 'Owner',
        createdAt: DateTime.utc(2026, 10, 31),
        text: 'hello',
        truncated: false,
        withheld: false,
        activity: null,
      ),
    ]);
    expect(send.state, isEmpty);
    await send.close();
  });
}

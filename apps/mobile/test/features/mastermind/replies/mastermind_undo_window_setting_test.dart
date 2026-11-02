import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../helpers/mastermind_replies_fixture.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final seconds in [0, 5, 10, 30]) {
    testWidgets('device choice $seconds is captured at queue time', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({});
      final settings = SettingsRepository();
      await settings.setMastermindUndoWindow(seconds);
      final transport = FakeReplyTransport();
      final now = DateTime.utc(2026);
      final cubit = MastermindRepliesCubit(
        store: SpyOutboxStore(),
        transport: transport,
        fetchCapabilities: capabilities(),
        clock: () => now,
      );
      addTearDown(cubit.close);
      await cubit.loadCapabilities();
      await cubit.ensureLoaded();
      final item = parsedItem(inboxItem(1));
      expect(cubit.queueOption(item: item, optionIndex: 0), isTrue);
      final held = cubit.state.outbox.single;
      expect(held.holdUntil, now.add(Duration(seconds: seconds)));
      await settings.setMastermindUndoWindow(0);
      expect(cubit.state.outbox.single.holdUntil, held.holdUntil);
      await tester.pump(Duration(seconds: seconds));
      await tester.pump();
      expect(transport.sent.single.idempotencyKey, held.idempotencyKey);
    });
  }

  testWidgets('Send now and timer race claims once and keeps original keys', (
    tester,
  ) async {
    final log = <String>[];
    final store = SpyOutboxStore(log);
    final transport = FakeReplyTransport();
    final cubit = repliesCubit(store: store, transport: transport);
    addTearDown(cubit.close);
    await cubit.loadCapabilities();
    await cubit.ensureLoaded();
    cubit.queueOption(item: parsedItem(inboxItem(1)), optionIndex: 0);
    await tester.pump();
    final key = cubit.state.outbox.single.idempotencyKey;
    final states = <MastermindRepliesState>[];
    final sub = cubit.stream.listen(states.add);
    addTearDown(sub.cancel);
    log.clear();
    store.writeGate = Completer<void>();
    transport.gate = Completer<void>();
    final sending = cubit.sendNow(inboxItemId(1));
    final duplicate = cubit.sendAllNow();
    await tester.pump(const Duration(seconds: 5));
    expect(states, hasLength(1));
    expect(log, ['write:1']);
    store.writeGate!.complete();
    await tester.pump();
    expect(transport.sent.single.idempotencyKey, key);
    transport.gate!.complete();
    await sending;
    await duplicate;
    await tester.pump(const Duration(seconds: 30));
    expect(transport.sent, hasLength(1));
  });

  testWidgets('Send all now releases each original key once', (tester) async {
    final transport = FakeReplyTransport();
    final cubit = repliesCubit(transport: transport);
    addTearDown(cubit.close);
    await cubit.loadCapabilities();
    await cubit.ensureLoaded();
    for (final n in [1, 2]) {
      cubit.queueOption(item: parsedItem(inboxItem(n)), optionIndex: 0);
    }
    final keys = cubit.state.outbox.map((e) => e.idempotencyKey).toSet();
    await cubit.sendAllNow();
    await tester.pump(const Duration(seconds: 30));
    expect(transport.sent.map((e) => e.idempotencyKey).toSet(), keys);
    expect(transport.sent, hasLength(2));
  });
}

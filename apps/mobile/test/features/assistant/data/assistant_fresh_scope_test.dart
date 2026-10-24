import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_reset_preferences.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

class _Host extends InMemorySharedPreferencesStore {
  _Host(super.data) : super.withData();
  int writes = 0;
  bool reject = false;
  Completer<void>? gate;
  final entered = Completer<void>();

  @override
  Future<bool> setValue(String type, String key, Object value) async {
    writes++;
    if (!entered.isCompleted) entered.complete();
    await gate?.future;
    if (reject) return false;
    return await super.setValue(type, key, value);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const actor = '33333333-3333-4333-8333-333333333333';
  var scope = 0;
  late String workspace;
  late _Host host;
  late AssistantResetPreferences store;
  setUp(() {
    workspace =
        'aaaaaaaa-aaaa-4aaa-8aaa-${(++scope).toString().padLeft(12, '0')}';
    SharedPreferences.resetStatic();
    host = _Host({});
    SharedPreferencesStorePlatform.instance = host;
    store = AssistantResetPreferences(
      actorId: actor,
      workspaceId: workspace,
      isCurrent: () => true,
    );
  });

  test(
    'fresh initialization is acknowledged once under the shared lock',
    () async {
      final gate = Completer<void>();
      host.gate = gate;
      final first = store.hasUnknownCreation();
      final second = AssistantResetPreferences(
        actorId: actor,
        workspaceId: workspace,
        isCurrent: () => true,
      ).hasUnknownCreation();
      try {
        await host.entered.future;
        expect(host.writes, 1);
      } finally {
        gate.complete();
      }
      expect(await first, false);
      expect(await second, false);
      expect(host.writes, 1);
      final envelope = (await store.read())!;
      expect(envelope.held, false);
      expect(envelope.pending, false);
      expect(envelope.selectedChatId, isNull);
      expect(envelope.contextId, isNull);
      expect(envelope.generation, 1);
      expect(envelope.revision, 1);
    },
  );

  for (final legacy in ['chat', 'context', 'creation']) {
    test('legacy $legacy without an envelope never becomes fresh', () async {
      final key = switch (legacy) {
        'chat' => '$actor::mira-dashboard-chat-$workspace',
        'context' => '$actor::mira-dashboard-workspace-context-$workspace',
        _ => '$actor::mira-chat-creation::$workspace',
      };
      final value = switch (legacy) {
        'chat' => '44444444-4444-4444-8444-444444444444',
        'context' => 'personal',
        _ => 'unknown:v1',
      };
      await host.setValue('String', 'flutter.$key', value);
      host.writes = 0;
      expect(await store.hasUnknownCreation(), true);
      expect(await store.read(), isNull);
      expect(host.writes, 0);
    });
  }

  test('an in-process hold without an envelope never becomes fresh', () async {
    store.hold();
    expect(await store.hasUnknownCreation(), true);
    expect(await store.read(), isNull);
    expect(host.writes, 0);
  });

  test(
    'lost reset envelope cannot turn its ticket into fresh authority',
    () async {
      final target = await store.inspectResetConsentTarget();
      final reset = await store.reset(
        '55555555-5555-4555-8555-555555555555',
        informed: true,
        consentTarget: target,
      );
      expect(reset.committedCurrent, true);
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(store.key);
      final priorWrites = host.writes;
      expect(await store.hasUnknownCreation(), true);
      expect(await store.read(), isNull);
      expect(host.writes, priorWrites);
    },
  );

  test('unacknowledged initialization cannot authorize creation', () async {
    host.reject = true;
    expect(await store.hasUnknownCreation(), true);
    expect(host.writes, 1);
    host.reject = false;
    expect(await store.hasUnknownCreation(), true);
    expect(host.writes, 1);
    await expectLater(
      store.beginCreation('66666666-6666-4666-8666-666666666666'),
      throwsFormatException,
    );
  });
}

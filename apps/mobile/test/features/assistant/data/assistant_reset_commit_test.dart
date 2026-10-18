import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_reset_preferences.dart';
import 'package:mobile/features/chat/data/chat_creation_receipt.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

const actor = '33333333-3333-4333-8333-333333333333';
const ws = '11111111-1111-4111-8111-111111111111';
const chat = '22222222-2222-4222-8222-222222222222';
const operation = '44444444-4444-4444-8444-444444444444';
const attempt = '55555555-5555-4555-8555-555555555555';
const envelopeKey = '$actor::mira-conversation-envelope::v1::$ws';

// Explicit confirmed records are synthetic test fixtures.
// Startup must never adopt legacy markers as confirmed records.
Map<String, dynamic> confirmedRecord() => {
  'schema': 1,
  'actorId': actor,
  'workspaceId': ws,
  'revision': 1,
  'generation': 1,
  'selectedChatId': chat,
  'contextId': 'prior',
  'creation': {'status': 'clear', 'attemptId': null},
  'resetConsent': null,
  'resetIntent': null,
};

class ResetHost extends InMemorySharedPreferencesStore {
  ResetHost({Map<String, Object>? data})
    : super.withData(
        data ?? {'flutter.$envelopeKey': jsonEncode(confirmedRecord())},
      );
  int writes = 0;
  int? faultAt;
  bool throws = false;
  bool acceptButFalse = false;
  int? holdAt;
  final entered = Completer<void>();
  final release = Completer<void>();
  Future<void> replaceRecord(Map<String, dynamic> record) async {
    await super.setValue('String', 'flutter.$envelopeKey', jsonEncode(record));
  }

  @override
  Future<bool> setValue(String type, String key, Object value) async {
    writes++;
    if (writes == holdAt) {
      entered.complete();
      await release.future;
    }
    if (writes == faultAt) {
      if (acceptButFalse) await super.setValue(type, key, value);
      if (throws) throw StateError('Synthetic host write failure');
      return false;
    }
    return await super.setValue(type, key, value);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late ResetHost host;
  var current = true;
  late AssistantResetPreferences store;
  setUp(() {
    SharedPreferences.resetStatic();
    host = ResetHost();
    SharedPreferencesStorePlatform.instance = host;
    current = true;
    AssistantResetPreferences.revokeConsent(envelopeKey);
    store = AssistantResetPreferences(
      actorId: actor,
      workspaceId: ws,
      isCurrent: () => current,
    );
  });
  Future<Map<String, dynamic>> raw() async =>
      jsonDecode((await host.getAll())['flutter.$envelopeKey']! as String)
          as Map<String, dynamic>;

  Future<AssistantResetOutcome> resetWithConsent() async => await store.reset(
    operation,
    informed: true,
    consentTarget: await store.inspectResetConsentTarget(),
  );
  for (final throws in [false, true]) {
    test('intent ${throws ? 'throw' : 'false'} has no final effect', () async {
      host
        ..faultAt = 1
        ..throws = throws;
      final result = await resetWithConsent();
      expect(result.disposition, AssistantResetDisposition.uncertain);
      expect(host.writes, 1);
      expect((await raw())['selectedChatId'], chat);
      expect((await raw())['contextId'], 'prior');
      expect(await store.hasUnknownCreation(), true);
      await expectLater(
        store.beginCreation(attempt),
        throwsA(isA<AssistantCreationSelectedException>()),
      );
      expect(host.writes, 1);
    });
    test(
      'final ${throws ? 'throw' : 'false'} leaves acknowledged intent',
      () async {
        host
          ..faultAt = 2
          ..throws = throws;
        final result = await resetWithConsent();
        expect(result.disposition, AssistantResetDisposition.uncertain);
        final observed = await raw();
        expect(observed['selectedChatId'], chat);
        expect(observed['contextId'], 'prior');
        expect(observed['resetIntent'], isNotNull);
        expect(await store.hasUnknownCreation(), true);
        SharedPreferences.resetStatic();
        final restarted = AssistantResetPreferences(
          actorId: actor,
          workspaceId: ws,
          isCurrent: () => true,
        );
        expect((await restarted.read())?.selectedChatId, chat);
        expect(await restarted.hasUnknownCreation(), true);
        expect(host.writes, 2);
      },
    );
  }
  test(
    'false after physical final acceptance is uncertain, never a grant',
    () async {
      host
        ..faultAt = 2
        ..acceptButFalse = true;
      expect(
        (await resetWithConsent()).disposition,
        AssistantResetDisposition.uncertain,
      );
      expect((await raw())['selectedChatId'], null);
      expect(await store.hasUnknownCreation(), true);
      await expectLater(store.beginCreation(attempt), throwsFormatException);
      expect(host.writes, 2);
    },
  );
  test(
    'known final consent authorizes exactly one next unknown attempt',
    () async {
      expect((await resetWithConsent()).committedCurrent, true);
      expect(await store.hasUnknownCreation(), false);
      final began = await store.beginCreation(attempt);
      expect(began.attemptId, attempt);
      expect(began.generation, 3);
      expect((await raw())['resetConsent'], null);
      expect(await store.hasUnknownCreation(), true);
      await expectLater(store.beginCreation(operation), throwsFormatException);
      await store.finishCreation(
        began,
        acknowledged: AcknowledgedChatConversation.fromResponse({
          'conversation': {
            'id': chat,
            'wsId': ws,
            'type': 'ai',
            'createdAt': '2026-10-12T00:00:00Z',
          },
        }, wsId: ws),
      );
      final saved = await raw();
      expect(saved['selectedChatId'], chat);
      expect(saved['creation'], {'status': 'clear', 'attemptId': null});
      expect(await store.hasUnknownCreation(), false);
    },
  );
  test(
    'final consent is not a restart or revised-record creation grant',
    () async {
      await resetWithConsent();
      AssistantResetPreferences.revokeConsent(envelopeKey);
      SharedPreferences.resetStatic();
      expect(await store.hasUnknownCreation(), true);
      await resetWithConsent();
      final prefs = AssistantPreferences(currentUserId: () => actor);
      await prefs.saveWorkspaceContextId(ws, 'changed');
      expect(await store.hasUnknownCreation(), true);
    },
  );
  for (final boundary in [1, 2]) {
    test(
      'admitted stale boundary $boundary never qualifies reset/create',
      () async {
        host.holdAt = boundary;
        final work = resetWithConsent();
        await host.entered.future;
        current = false;
        host.release.complete();
        final result = await work;
        expect(
          result.disposition,
          boundary == 1
              ? AssistantResetDisposition.uncertain
              : AssistantResetDisposition.committedStale,
        );
        expect(host.writes, boundary);
        current = true;
        expect(await store.hasUnknownCreation(), true);
        await expectLater(
          store.beginCreation(attempt),
          throwsA(
            boundary == 1
                ? isA<AssistantCreationSelectedException>()
                : isA<FormatException>(),
          ),
        );
      },
    );
  }
  test('the same reset operation cannot be replayed as a new grant', () async {
    await resetWithConsent();
    AssistantResetPreferences.revokeConsent(envelopeKey);
    expect(
      (await resetWithConsent()).disposition,
      AssistantResetDisposition.deniedBeforeEffect,
    );
    expect(host.writes, 2);
    expect(await store.hasUnknownCreation(), true);
  });
  test('all owning selected/context wrappers preserve creation hold', () async {
    await resetWithConsent();
    final began = await store.beginCreation(attempt);
    final prefs = AssistantPreferences(currentUserId: () => actor);
    await prefs.saveChatId(ws, chat);
    await prefs.saveWorkspaceContextId(ws, 'context');
    expect(await prefs.loadChatId(ws), chat);
    expect(await prefs.loadWorkspaceContextId(ws), 'context');
    await prefs.clearChatId(ws);
    await prefs.clearWorkspaceContextId(ws);
    expect(await prefs.loadChatId(ws), null);
    expect(await prefs.loadWorkspaceContextId(ws), null);
    expect(await store.hasUnknownCreation(), true);
    expect((await raw())['generation'], began.generation);
    expect((await raw())['creation'], {
      'status': 'unknown',
      'attemptId': attempt,
    });
  });
  test(
    'pending intent denies ordinary mutation and retains beforeimage',
    () async {
      host.faultAt = 2;
      await resetWithConsent();
      final prefs = AssistantPreferences(currentUserId: () => actor);
      await expectLater(prefs.saveChatId(ws, operation), throwsFormatException);
      expect(
        await prefs.clearChatIdAcknowledged(
          ws,
          actorId: actor,
          isCurrent: () => true,
        ),
        false,
      );
      expect(
        await prefs.saveWorkspaceContextIdAcknowledged(
          ws,
          'personal',
          actorId: actor,
          isCurrent: () => true,
        ),
        false,
      );
      expect(await prefs.loadChatId(ws), chat);
      expect(await prefs.loadWorkspaceContextId(ws), 'prior');
      expect(host.writes, 2);
    },
  );
  test(
    'legacy clear is readonly fallback with no startup creation grant',
    () async {
      host = ResetHost(
        data: {
          'flutter.$actor::mira-dashboard-chat-$ws': chat,
          'flutter.$actor::mira-dashboard-workspace-context-$ws': 'prior',
          'flutter.$actor::mira-chat-creation::$ws': 'clear:v1',
        },
      );
      SharedPreferencesStorePlatform.instance = host;
      final prefs = AssistantPreferences(currentUserId: () => actor);
      expect(await prefs.loadChatId(ws), chat);
      expect(await store.hasUnknownCreation(), true);
      expect(host.writes, 0);
      await prefs.saveWorkspaceContextId(ws, 'changed');
      final saved = await raw();
      expect(saved['creation'], {'status': 'unknown', 'attemptId': null});
      expect(saved['resetConsent'], null);
      expect(
        (await host
            .getAll())['flutter.$actor::mira-dashboard-workspace-context-$ws'],
        'prior',
      );
    },
  );
  for (final corrupt in [
    {...confirmedRecord(), 'schema': 2},
    {...confirmedRecord(), 'schema': 1.0},
    {...confirmedRecord(), 'revision': '1'},
    {...confirmedRecord(), 'extra': true},
    {...confirmedRecord(), 'actorId': operation},
    {...confirmedRecord()}..remove('resetIntent'),
  ]) {
    test(
      'malformed canonical record cannot fall back or be overwritten $corrupt',
      () async {
        host = ResetHost(
          data: {
            'flutter.$envelopeKey': jsonEncode(corrupt),
            'flutter.$actor::mira-dashboard-chat-$ws': chat,
          },
        );
        SharedPreferencesStorePlatform.instance = host;
        final prefs = AssistantPreferences(currentUserId: () => actor);
        await expectLater(prefs.loadChatId(ws), throwsFormatException);
        expect(
          (await resetWithConsent()).disposition,
          AssistantResetDisposition.deniedBeforeEffect,
        );
        expect(host.writes, 0);
      },
    );
  }
}

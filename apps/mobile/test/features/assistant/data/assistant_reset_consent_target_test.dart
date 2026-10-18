import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_reset_preferences.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

import 'assistant_reset_commit_test.dart' as fixture;

class _UnreadableHost extends fixture.ResetHost {
  bool unreadable = false;
  @override
  Future<Map<String, Object>> getAll() {
    if (unreadable) throw StateError('Synthetic host read failure');
    return super.getAll();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late fixture.ResetHost host;
  late AssistantResetPreferences store;
  var current = true;
  Map<String, dynamic> heldRecord() => {
    ...fixture.confirmedRecord(),
    'creation': {'status': 'unknown', 'attemptId': fixture.attempt},
  };
  setUp(() {
    SharedPreferences.resetStatic();
    host = fixture.ResetHost(
      data: {'flutter.${fixture.envelopeKey}': jsonEncode(heldRecord())},
    );
    SharedPreferencesStorePlatform.instance = host;
    current = true;
    AssistantResetPreferences.revokeConsent(fixture.envelopeKey);
    store = AssistantResetPreferences(
      actorId: fixture.actor,
      workspaceId: fixture.ws,
      isCurrent: () => current,
    );
  });
  Future<AssistantResetOutcome> reset(AssistantResetConsentTarget? target) =>
      store.reset(fixture.operation, informed: true, consentTarget: target);
  Future<Map<String, dynamic>> raw() async =>
      jsonDecode(
            (await host.getAll())['flutter.${fixture.envelopeKey}']! as String,
          )
          as Map<String, dynamic>;

  test('bare true is denied before any intent or effect', () async {
    final before = await host.getAll();
    expect(
      (await reset(null)).disposition,
      AssistantResetDisposition.deniedBeforeEffect,
    );
    expect(host.writes, 0);
    expect(await host.getAll(), before);
  });

  test(
    'capture and cancel are readonly and do not authorize creation',
    () async {
      final before = await host.getAll();
      final target = await store.inspectResetConsentTarget();
      expect(target, isNotNull);
      expect(target!.actorId, fixture.actor);
      expect(target.workspaceId, fixture.ws);
      expect(target.requiresConsent, true);
      expect(host.writes, 0);
      expect(await host.getAll(), before);
      await expectLater(
        store.beginCreation(fixture.operation),
        throwsA(isA<AssistantCreationSelectedException>()),
      );
      expect(host.writes, 0);
    },
  );

  test('current target yields known ACK then replay is denied', () async {
    final target = await store.inspectResetConsentTarget();
    expect((await reset(target)).committedCurrent, true);
    expect(host.writes, 2);
    expect(await store.hasUnknownCreation(), false);
    final before = await host.getAll();
    expect(
      (await reset(target)).disposition,
      AssistantResetDisposition.deniedBeforeEffect,
    );
    expect(host.writes, 2);
    expect(await host.getAll(), before);
  });

  test(
    'consumed target stays denied after exact beforeimage restoration',
    () async {
      final target = await store.inspectResetConsentTarget();
      expect((await reset(target)).committedCurrent, true);
      await host.replaceRecord(heldRecord());
      expect(
        (await reset(target)).disposition,
        AssistantResetDisposition.deniedBeforeEffect,
      );
      expect(host.writes, 2);
      expect((await raw())['resetIntent'], null);
    },
  );

  for (final replacement in [
    {...fixture.confirmedRecord(), 'revision': 2},
    {...fixture.confirmedRecord(), 'generation': 2},
    {...fixture.confirmedRecord(), 'selectedChatId': fixture.operation},
    {...fixture.confirmedRecord(), 'contextId': 'replacement'},
    fixture.confirmedRecord(),
    {
      ...fixture.confirmedRecord(),
      'creation': {'status': 'unknown', 'attemptId': fixture.operation},
    },
  ]) {
    test('complete held identity rejects replacement $replacement', () async {
      final target = await store.inspectResetConsentTarget();
      await host.replaceRecord(replacement);
      final before = await host.getAll();
      expect(
        (await reset(target)).disposition,
        AssistantResetDisposition.deniedBeforeEffect,
      );
      expect(host.writes, 0);
      expect(await host.getAll(), before);
    });
  }

  test(
    'same-process writer invalidates target through restored-record ABA',
    () async {
      final target = await store.inspectResetConsentTarget();
      expect(
        await store.update(contextId: 'changed', changeContext: true),
        true,
      );
      await host.replaceRecord(heldRecord());
      final writes = host.writes;
      expect(
        (await reset(target)).disposition,
        AssistantResetDisposition.deniedBeforeEffect,
      );
      expect(host.writes, writes);
      expect((await raw())['resetIntent'], null);
    },
  );

  test('observed replacement fences an exact-record restoration ABA', () async {
    final target = await store.inspectResetConsentTarget();
    await host.replaceRecord({...heldRecord(), 'contextId': 'replacement'});
    expect(
      (await reset(target)).disposition,
      AssistantResetDisposition.deniedBeforeEffect,
    );
    await host.replaceRecord(heldRecord());
    expect(
      (await reset(target)).disposition,
      AssistantResetDisposition.deniedBeforeEffect,
    );
    expect(host.writes, 0);
  });

  for (final reader in ['read', 'selection', 'unknown']) {
    for (final replacement in [
      'canonical context',
      'canonical absence',
      'legacy marker',
      'legacy presence',
    ]) {
      test(
        'successful read observes $replacement via $reader fences ABA',
        () async {
          final legacy = replacement.startsWith('legacy');
          const legacyKey =
              'flutter.${fixture.actor}::mira-chat-creation::${fixture.ws}';
          if (legacy) {
            host = fixture.ResetHost(
              data: {
                'flutter.${fixture.actor}::mira-dashboard-chat-${fixture.ws}':
                    fixture.chat,
                legacyKey: 'unknown:v1',
              },
            );
            SharedPreferencesStorePlatform.instance = host;
          }
          final target = await store.inspectResetConsentTarget();
          expect(target, isNotNull);
          if (replacement == 'canonical context') {
            await host.replaceRecord({
              ...heldRecord(),
              'contextId': 'replacement',
            });
          } else if (replacement == 'canonical absence') {
            await host.remove('flutter.${fixture.envelopeKey}');
          } else if (replacement == 'legacy marker') {
            await host.setValue('String', legacyKey, 'clear:v1');
          } else {
            await host.remove(legacyKey);
          }
          if (reader == 'read') {
            final observed = await store.read();
            expect(
              observed?.contextId,
              replacement == 'canonical context' ? 'replacement' : null,
            );
          } else if (reader == 'selection') {
            final observed = await store.readSelection();
            expect(
              observed.contextId,
              replacement == 'canonical context' ? 'replacement' : null,
            );
            expect(
              observed.selectedChatId,
              replacement == 'canonical absence' ? null : fixture.chat,
            );
          } else {
            expect(await store.hasUnknownCreation(), true);
          }
          if (legacy) {
            await host.setValue('String', legacyKey, 'unknown:v1');
          } else {
            await host.replaceRecord(heldRecord());
          }
          final before = await host.getAll();
          final writes = host.writes;
          expect(
            (await reset(target)).disposition,
            AssistantResetDisposition.deniedBeforeEffect,
          );
          expect(host.writes, writes);
          expect(await host.getAll(), before);
          if (!legacy) expect((await raw())['resetIntent'], null);
        },
      );
    }
  }

  test('unchanged successful reads retain the captured target', () async {
    final target = await store.inspectResetConsentTarget();
    expect((await store.read())?.contextId, 'prior');
    expect((await store.readSelection()).selectedChatId, fixture.chat);
    expect(await store.hasUnknownCreation(), true);
    expect(host.writes, 0);
    expect((await reset(target)).committedCurrent, true);
  });

  test(
    'observed drift invalidates only target, preserving creation ticket',
    () async {
      expect(
        (await reset(await store.inspectResetConsentTarget())).committedCurrent,
        true,
      );
      final before = await raw();
      final target = await store.inspectResetConsentTarget();
      expect(target!.requiresConsent, false);
      await host.replaceRecord({...before, 'contextId': 'replacement'});
      expect((await store.read())?.contextId, 'replacement');
      await host.replaceRecord(before);
      expect(await store.hasUnknownCreation(), false);
      expect(
        (await store.reset(
          fixture.attempt,
          informed: true,
          consentTarget: target,
        )).disposition,
        AssistantResetDisposition.deniedBeforeEffect,
      );
      expect(host.writes, 2);
      expect(await raw(), before);
    },
  );

  test('new inspection invalidates a previously issued object', () async {
    final old = await store.inspectResetConsentTarget();
    final current = await store.inspectResetConsentTarget();
    expect(identical(old, current), false);
    expect(
      (await reset(old)).disposition,
      AssistantResetDisposition.deniedBeforeEffect,
    );
    expect(host.writes, 0);
    expect((await reset(current)).committedCurrent, true);
  });

  test('scope change denies capture and stale target without writes', () async {
    final target = await store.inspectResetConsentTarget();
    current = false;
    expect(await store.inspectResetConsentTarget(), null);
    expect(
      (await reset(target)).disposition,
      AssistantResetDisposition.deniedBeforeEffect,
    );
    expect(host.writes, 0);
  });

  test('actor/workspace binding rejects another store target', () async {
    final other = AssistantResetPreferences(
      actorId: fixture.operation,
      workspaceId: fixture.ws,
      isCurrent: () => true,
    );
    final target = await other.inspectResetConsentTarget();
    expect(target, isNotNull);
    expect(
      (await reset(target)).disposition,
      AssistantResetDisposition.deniedBeforeEffect,
    );
    expect(host.writes, 0);
  });

  test('unreadable fresh authority denies captured target', () async {
    final unreadable = _UnreadableHost();
    host = unreadable;
    SharedPreferencesStorePlatform.instance = host;
    final target = await store.inspectResetConsentTarget();
    unreadable.unreadable = true;
    expect(
      (await reset(target)).disposition,
      AssistantResetDisposition.deniedBeforeEffect,
    );
    expect(await store.inspectResetConsentTarget(), null);
    expect(host.writes, 0);
  });

  test('legacy target binds exact marker beforeimage without writes', () async {
    host = fixture.ResetHost(
      data: {
        'flutter.${fixture.actor}::mira-dashboard-chat-${fixture.ws}':
            fixture.chat,
        'flutter.${fixture.actor}::mira-dashboard-workspace-context-'
                '${fixture.ws}':
            'prior',
        'flutter.${fixture.actor}::mira-chat-creation::${fixture.ws}':
            'clear:v1',
      },
    );
    SharedPreferencesStorePlatform.instance = host;
    final target = await store.inspectResetConsentTarget();
    expect(target!.requiresConsent, true);
    expect(host.writes, 0);
    // Independent host replacement, not a parent reset write.
    await host.setValue(
      'String',
      'flutter.${fixture.actor}::mira-chat-creation::${fixture.ws}',
      'unknown:v1',
    );
    final writes = host.writes;
    expect(
      (await reset(target)).disposition,
      AssistantResetDisposition.deniedBeforeEffect,
    );
    expect(host.writes, writes);
    expect(
      (await host.getAll()).containsKey('flutter.${fixture.envelopeKey}'),
      false,
    );
  });

  test(
    'wrongly typed legacy marker fails closed without canonical creation',
    () async {
      host = fixture.ResetHost(
        data: {
          'flutter.${fixture.actor}::mira-chat-creation::${fixture.ws}': 7,
        },
      );
      SharedPreferencesStorePlatform.instance = host;
      expect(await store.inspectResetConsentTarget(), null);
      expect(
        (await reset(null)).disposition,
        AssistantResetDisposition.deniedBeforeEffect,
      );
      expect(host.writes, 0);
      expect(
        (await host.getAll()).containsKey('flutter.${fixture.envelopeKey}'),
        false,
      );
    },
  );

  test(
    'pending intent identity rejects changed operation before overwrite',
    () async {
      host.faultAt = 2;
      expect(
        (await reset(await store.inspectResetConsentTarget())).disposition,
        AssistantResetDisposition.uncertain,
      );
      final target = await store.inspectResetConsentTarget();
      final pending = await raw();
      (pending['resetIntent'] as Map)['operationId'] = fixture.attempt;
      await host.replaceRecord(pending);
      final writes = host.writes;
      expect(
        (await store.reset(
          fixture.attempt,
          informed: true,
          consentTarget: target,
        )).disposition,
        AssistantResetDisposition.deniedBeforeEffect,
      );
      expect(host.writes, writes);
    },
  );

  test('committed consent identity rejects a same-scope replacement', () async {
    expect(
      (await reset(await store.inspectResetConsentTarget())).committedCurrent,
      true,
    );
    final target = await store.inspectResetConsentTarget();
    final committed = await raw();
    (committed['resetConsent'] as Map)['operationId'] = fixture.attempt;
    await host.replaceRecord(committed);
    final writes = host.writes;
    expect(
      (await store.reset(
        fixture.attempt,
        informed: true,
        consentTarget: target,
      )).disposition,
      AssistantResetDisposition.deniedBeforeEffect,
    );
    expect(host.writes, writes);
  });

  test('readable legacy target permits a known whole-tuple ACK', () async {
    host = fixture.ResetHost(
      data: {
        'flutter.${fixture.actor}::mira-dashboard-chat-${fixture.ws}':
            fixture.chat,
        'flutter.${fixture.actor}::mira-chat-creation::${fixture.ws}':
            'unknown:v1',
      },
    );
    SharedPreferencesStorePlatform.instance = host;
    final target = await store.inspectResetConsentTarget();
    expect(target!.requiresConsent, true);
    expect((await reset(target)).committedCurrent, true);
    expect(host.writes, 2);
    expect(await store.hasUnknownCreation(), false);
    final consent = (await raw())['resetConsent'] as Map;
    expect(
      (consent['priorHold'] as Map)['legacyDigest'],
      '1c4460e59df251cf4b6545f3ad2d2cdec10209d998b72ae421bf7720526a56b8',
    );
  });

  test('ordinary no-hold reset remains available without consent', () async {
    expect(
      (await reset(await store.inspectResetConsentTarget())).committedCurrent,
      true,
    );
    final creation = await store.beginCreation(fixture.attempt);
    await store.finishCreation(
      creation,
      denial: const ApiException(
        message: 'Synthetic known denial',
        statusCode: 400,
        code: 'chat_create_invalid_request',
      ),
    );
    expect(await store.hasUnknownCreation(), false);
    expect((await store.inspectResetConsentTarget())!.requiresConsent, false);
    expect(
      (await store.reset(fixture.attempt, informed: false)).committedCurrent,
      true,
    );
  });
}

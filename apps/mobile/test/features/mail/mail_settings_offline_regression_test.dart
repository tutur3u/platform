import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_cache.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/data/mail_settings_snapshot.dart';
import 'package:mocktail/mocktail.dart';

class _SecureStorage extends Mock implements FlutterSecureStorage {}

class _Api extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late CacheStore store;
  late MailCache cache;
  late _Api api;
  late MailRepository repository;
  late OfflineMutationQueue queue;
  late String actor;
  late bool online;
  const ws = 'workspace';
  const mailbox = 'mailbox';
  final path = '${MailRepository.mailboxPath(ws, mailbox)}/settings';

  setUp(() async {
    actor = 'actor';
    online = false;
    final directory = await Directory.systemTemp.createTemp('mail-settings-');
    final storage = _SecureStorage();
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((_) async => null);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((_) async {});
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    cache = MailCache(store: store, currentUserId: () => actor);
    api = _Api();
    queue = OfflineMutationQueue.forTesting(
      store: store,
      userId: () => actor,
      checkConnectivity: () async => [
        if (online) ConnectivityResult.wifi else ConnectivityResult.none,
      ],
      connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
      apiFactory: (_) => api,
    );
    repository = MailRepository(
      apiClient: api,
      cache: cache,
      settingsQueue: queue,
      currentUserId: () => actor,
    );
    addTearDown(() async {
      await queue.synchronize();
      await queue.dispose();
      repository.dispose();
      await store.closeForTesting();
      await Hive.close();
      await directory.delete(recursive: true);
    });
  });

  test(
    'group policy keeps required history literal through queue and replay',
    () async {
      final payload = <String, dynamic>{
        'senderName': 'Group',
        'groupPolicy': {
          'posting': 'members',
          'attachments': 'allow',
          'sendAs': 'members',
          'historyEnabled': false,
        },
      };
      await repository.updateSettings(ws, mailbox, payload);
      final pending = queue.pending.value.single;
      final policy = pending.payload!['groupPolicy'] as Map<String, dynamic>;
      expect(policy, payload['groupPolicy']);
      expect(policy['historyEnabled'], isFalse);
      when(
        () => api.patchJson(path, any()),
      ).thenAnswer((_) async => {'settings': payload});
      online = true;
      await queue.synchronize();
      expect(queue.pending.value, isEmpty);
      verify(() => api.patchJson(path, payload)).called(1);
    },
  );

  test('restores a scoped snapshot and revalidates even while fresh', () async {
    var reads = 0;
    when(() => api.getJson(path)).thenAnswer(
      (_) async => {
        'settings': {'senderName': 'Server ${++reads}', 'token': 'excluded'},
      },
    );
    await repository.settings(ws, mailbox);
    expect((await repository.cachedSettings(ws, mailbox))?['settings'], {
      'senderName': 'Server 1',
    });
    expect((await repository.settings(ws, mailbox))['settings'], {
      'senderName': 'Server 2',
    });
    expect(await repository.cachedSettings('other', mailbox), isNull);
    expect(await repository.cachedSettings(ws, 'other'), isNull);
    actor = 'other';
    await expectLater(
      repository.cachedSettings(ws, mailbox),
      throwsA(isA<ApiException>()),
    );
    await expectLater(
      repository.updateSettings(ws, mailbox, {'senderName': 'Wrong actor'}),
      throwsA(isA<ApiException>()),
    );
    verifyNever(() => api.patchJson(any(), any()));
  });

  test(
    'restored account addresses contain no cached management grants',
    () async {
      final bootstrap = '${MailRepository.workspacePath(ws)}/bootstrap';
      when(() => api.getJson(bootstrap)).thenAnswer(
        (_) async => {
          'token': 'excluded',
          'mailboxes': [
            {
              'id': mailbox,
              'address': 'address@example.test',
              'role': 'owner',
              'secret': 'excluded',
            },
          ],
        },
      );
      expect(
        mailRows(
          (await repository.settingsBootstrap(ws))['mailboxes'],
        ).single['role'],
        'owner',
      );
      expect((await repository.cachedSettingsAccounts(ws))?['mailboxes'], [
        {'id': mailbox, 'address': 'address@example.test'},
      ]);
      when(
        () => api.getJson(bootstrap),
      ).thenThrow(const ApiException.transport(message: 'Offline'));
      expect((await repository.settingsBootstrap(ws))['mailboxes'], [
        {'id': mailbox, 'address': 'address@example.test'},
      ]);
    },
  );

  test(
    'offline edits overlay only their actor, workspace and settings path',
    () async {
      when(() => api.getJson(path)).thenAnswer(
        (_) async => {
          'settings': {'senderName': 'Server', 'signatureText': 'Signature'},
        },
      );
      await repository.settings(ws, mailbox);
      await repository.updateSettings(ws, mailbox, {
        'senderName': 'Queued',
        'credential': 'excluded',
      });
      final pending = (await queue.listPending()).single;
      expect(pending.path, path);
      expect(pending.entityId, mailSettingsEntityId(mailbox));
      expect(pending.replaySafe, isFalse);
      expect(pending.payload, {'senderName': 'Queued'});
      final result = (await repository.cachedSettings(ws, mailbox))!;
      expect(result['settings'], {
        'senderName': 'Queued',
        'signatureText': 'Signature',
      });
      verifyNever(() => api.patchJson(any(), any()));
      for (final other in [
        pending.copyWith(),
        PendingMutationRecord(
          id: 'foreign',
          feature: 'mail',
          method: 'PATCH',
          path: path,
          userId: 'other',
          workspaceId: ws,
          createdAt: DateTime.utc(2026),
          payload: const {'senderName': 'Foreign'},
        ),
        PendingMutationRecord(
          id: 'foreign-workspace',
          feature: 'mail',
          method: 'PATCH',
          path: path,
          userId: actor,
          workspaceId: 'other',
          createdAt: DateTime.utc(2026),
          payload: const {'senderName': 'Foreign'},
        ),
        PendingMutationRecord(
          id: 'foreign-path',
          feature: 'mail',
          method: 'PATCH',
          path: '$path/other',
          userId: actor,
          workspaceId: ws,
          createdAt: DateTime.utc(2026),
          payload: const {'senderName': 'Foreign'},
        ),
      ]) {
        final overlay = overlayPendingMailSettings(
          userId: actor,
          workspaceId: ws,
          path: path,
          source: {
            'settings': {'senderName': 'Server'},
          },
          pending: [other],
        );
        expect(
          (overlay['settings'] as Map<String, dynamic>)['senderName'],
          other.id == pending.id ? 'Queued' : 'Server',
        );
      }
    },
  );

  test(
    'an uncertain connected save retains one manual-review operation',
    () async {
      online = true;
      when(
        () => api.patchJson(path, any()),
      ).thenThrow(const ApiException.transport(message: 'Unknown outcome'));
      await repository.updateSettings(ws, mailbox, {'senderName': 'Uncertain'});
      final operation = (await queue.listPending()).single;
      expect(operation.status, PendingMutationStatus.conflict);
      expect(operation.replaySafe, isFalse);
      await queue.drain();
      final retained = (await queue.listPending()).single;
      expect(retained.id, operation.id);
      expect(retained.status, PendingMutationStatus.conflict);
      verify(() => api.patchJson(path, {'senderName': 'Uncertain'})).called(1);
    },
  );

  test('a queued transport failure blocks later automatic retries', () async {
    await repository.updateSettings(ws, mailbox, {'autoDraftEnabled': true});
    final operation = (await queue.listPending()).single;
    online = true;
    when(() => api.patchJson(path, any())).thenThrow(
      const ApiException.transport(message: 'Unknown replay outcome'),
    );
    await queue.drain();
    expect(
      (await queue.listPending()).single.status,
      PendingMutationStatus.conflict,
    );
    await queue.drain();
    expect((await queue.listPending()).single.id, operation.id);
    verify(() => api.patchJson(path, {'autoDraftEnabled': true})).called(1);
  });

  test('an acknowledged queued edit is removed and never sent again', () async {
    await repository.updateSettings(ws, mailbox, {'senderName': 'Queued'});
    expect(await queue.listPending(), hasLength(1));
    when(() => api.patchJson(path, any())).thenAnswer(
      (_) async => {
        'settings': {'senderName': 'Queued'},
      },
    );
    online = true;
    await queue.drain();
    expect(await queue.listPending(), isEmpty);
    await queue.drain();
    verify(() => api.patchJson(path, {'senderName': 'Queued'})).called(1);
  });

  test(
    'overlapping membership reads share only fresh in-memory grants',
    () async {
      final bootstrap = '${MailRepository.workspacePath(ws)}/bootstrap';
      final response = Completer<Map<String, dynamic>>();
      when(() => api.getJson(bootstrap)).thenAnswer((_) => response.future);
      final first = repository.settingsBootstrap(ws);
      final second = repository.settingsBootstrap(ws);
      response.complete({
        'mailboxes': [
          {'id': mailbox, 'address': 'account@example.test', 'role': 'owner'},
        ],
      });
      final responses = await Future.wait([first, second]);
      for (final result in responses) {
        expect(mailRows(result['mailboxes']).single['role'], 'owner');
      }
      verify(() => api.getJson(bootstrap)).called(1);
      expect((await repository.cachedSettingsAccounts(ws))?['mailboxes'], [
        {'id': mailbox, 'address': 'account@example.test'},
      ]);
    },
  );

  for (final status in [401, 403, 404]) {
    test(
      '$status removes the settings snapshot after a fresh denial',
      () async {
        when(() => api.getJson(path)).thenAnswer(
          (_) async => {
            'settings': {'senderName': 'Private'},
          },
        );
        await repository.settings(ws, mailbox);
        when(
          () => api.getJson(path),
        ).thenThrow(ApiException(message: 'Denied', statusCode: status));
        await expectLater(
          repository.settings(ws, mailbox),
          throwsA(anyOf(isA<ApiException>(), isA<StateError>())),
        );
        expect(await repository.cachedSettings(ws, mailbox), isNull);
      },
    );
  }

  test(
    'verification challenge retains settings without refreshing grants',
    () async {
      when(() => api.getJson(path)).thenAnswer(
        (_) async => {
          'settings': {'senderName': 'Retained'},
        },
      );
      await repository.settings(ws, mailbox);
      when(() => api.getJson(path)).thenThrow(
        const ApiException(
          message: 'Verification',
          statusCode: 403,
          code: 'MFA_REQUIRED',
        ),
      );
      await expectLater(
        repository.settings(ws, mailbox),
        throwsA(isA<ApiException>()),
      );
      expect((await repository.cachedSettings(ws, mailbox))?['settings'], {
        'senderName': 'Retained',
      });
    },
  );
}

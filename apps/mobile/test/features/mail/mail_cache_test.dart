import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_cache.dart';
import 'package:mocktail/mocktail.dart';

class _SecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  Future<CacheStore> createStore() async {
    final directory = await Directory.systemTemp.createTemp('mail-view-test-');
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
    final store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    addTearDown(() async {
      await store.closeForTesting();
      await Hive.close();
      await directory.delete(recursive: true);
    });
    return store;
  }

  test(
    'rapid mailbox selections persist the last view, scoped by account',
    () async {
      final store = await createStore();
      var user = 'a';
      final mail = MailCache(store: store, currentUserId: () => user);
      await Future.wait([
        mail.saveSnapshot('ws', 'view', {'mailbox': 'first'}),
        mail.saveSnapshot('ws', 'view', {
          'mailbox': 'last',
          'label': 'important',
        }),
      ]);
      final reopened = MailCache(store: store, currentUserId: () => user);
      expect((await reopened.snapshot('ws', 'view'))?['mailbox'], 'last');
      expect((await reopened.snapshot('ws', 'view'))?['label'], 'important');
      expect(await reopened.snapshot('other', 'view'), isNull);
      user = 'b';
      expect(await reopened.snapshot('ws', 'view'), isNull);
      final other = MailCache(store: store, currentUserId: () => user);
      expect(await other.snapshot('ws', 'view'), isNull);
    },
  );

  test('mail mutations invalidate lists but preserve the saved view', () async {
    final store = await createStore();
    final mail = MailCache(store: store, currentUserId: () => 'a');
    await mail.saveSnapshot('ws', 'view-state', {
      'mailboxId': 'box',
      'items': <Map<String, dynamic>>[],
    });
    await mail.read('ws', 'inbox', () async => {'threads': <dynamic>[]});

    await mail.mutate('ws', () async {});

    var refreshes = 0;
    await mail.read('ws', 'inbox', () async {
      refreshes++;
      return {'threads': <dynamic>[]};
    });
    expect(refreshes, 1);
    expect((await mail.snapshot('ws', 'view-state'))?['mailboxId'], 'box');
  });

  test(
    'denied access clears snapshots and suppresses queued late writes',
    () async {
      final store = await createStore();
      final mail = MailCache(store: store, currentUserId: () => 'a');
      await mail.saveSnapshot('ws', 'view', {'mailbox': 'private'});
      final pending = mail.saveSnapshot('ws', 'view', {'mailbox': 'late'});
      await mail.denyAccess('ws');
      await pending;
      await mail.saveSnapshot('ws', 'view', {'mailbox': 'later'});
      final reopened = MailCache(store: store, currentUserId: () => 'a');
      expect(await reopened.snapshot('ws', 'view'), isNull);
    },
  );

  test('old account cache rejects network work after account switch', () async {
    final store = await createStore();
    var user = 'a';
    final mail = MailCache(store: store, currentUserId: () => user);
    user = 'b';
    var fetched = false;
    await expectLater(
      mail.read('ws', 'inbox', () async {
        fetched = true;
        return {'private': true};
      }),
      throwsA(isA<ApiException>()),
    );
    expect(fetched, isFalse);
  });

  for (final status in [401, 403]) {
    test('$status purges scoped mail and pending responses', () async {
      final directory = await Directory.systemTemp.createTemp(
        'mail-cache-test-',
      );
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
      final store = CacheStore.forTesting(
        secureStorage: storage,
        directoryResolver: () async => directory,
      );
      addTearDown(() async {
        await store.closeForTesting();
        await Hive.close();
        await directory.delete(recursive: true);
      });
      final mail = MailCache(store: store, currentUserId: () => 'a');
      final otherUser = MailCache(store: store, currentUserId: () => 'b');
      await mail.read('ws', 'inbox', () async => {'value': 'inbox'});
      await mail.read('ws', 'sent', () async => {'value': 'sent'});
      await mail.read(
        'other',
        'inbox',
        () async => {'value': 'other workspace'},
      );
      await otherUser.read('ws', 'inbox', () async => {'value': 'other user'});
      const finance = CacheKey(
        namespace: 'finance',
        userId: 'a',
        workspaceId: 'ws',
      );
      await store.write(
        key: finance,
        policy: CachePolicies.detail,
        payload: 'wallet',
      );
      await store.savePendingMutation(
        PendingMutationRecord(
          id: 'offline-finance',
          feature: 'finance',
          method: 'POST',
          path: '/finance',
          createdAt: DateTime.now(),
          userId: 'a',
          workspaceId: 'ws',
        ),
      );
      final response = Completer<Map<String, dynamic>>();
      final started = Completer<void>();
      final pending = mail.read('ws', 'drafts', () {
        started.complete();
        return response.future;
      });
      // Invalidated consumers receive no data; MailCache reports failure.
      final pendingCheck = expectLater(pending, throwsStateError);
      await started.future;
      await expectLater(
        mail.read('ws', 'inbox', () async {
          throw ApiException(message: 'Denied', statusCode: status);
        }, forceRefresh: true),
        throwsA(isA<ApiException>()),
      );
      response.complete({'value': 'revoked draft'});
      await pendingCheck;
      expect(mail.peek('ws', 'inbox'), isNull);
      expect(mail.peek('ws', 'sent'), isNull);
      expect(mail.peek('ws', 'drafts'), isNull);
      expect(mail.peek('other', 'inbox')?['value'], 'other workspace');
      expect(otherUser.peek('ws', 'inbox')?['value'], 'other user');
      expect(
        (await store.read(key: finance, decode: (value) => value)).data,
        'wallet',
      );
      expect((await store.listPendingMutations()).single.id, 'offline-finance');
    });
  }
}

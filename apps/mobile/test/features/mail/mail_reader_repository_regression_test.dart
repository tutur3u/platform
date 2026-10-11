import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_cache.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends Mock implements ApiClient {}

void main() {
  for (final status in [401, 403]) {
    test(
      'repository denial survives unavailable encrypted cache $status',
      () async {
        final storage = _Storage();
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
          directoryResolver: () async =>
              throw const FileSystemException('Unavailable cache directory'),
        );
        addTearDown(store.closeForTesting);
        addTearDown(Hive.close);
        final cache = MailCache(store: store, currentUserId: () => 'actor');
        final api = _Api();
        final repository = MailRepository(apiClient: api, cache: cache);
        when(
          () => api.getJson(any()),
        ).thenThrow(ApiException(message: 'Denied', statusCode: status));
        await expectLater(
          repository.detail('ws', 'box', 'thread', thread: true),
          throwsA(isA<ApiException>()),
        );
        expect(cache.accessRevoked.value, 'ws');
        when(
          () => api.getJson(any()),
        ).thenAnswer((_) async => {'fresh': 'authorized network response'});
        expect(
          (await repository.detail(
            'ws',
            'box',
            'thread',
            thread: true,
          ))['fresh'],
          'authorized network response',
        );
        verify(() => api.getJson(any())).called(2);
        expect(await repository.cachedThread('ws', 'box', 'thread'), isNull);
      },
    );
  }
}

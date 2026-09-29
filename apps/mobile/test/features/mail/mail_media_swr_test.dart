import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_cache.dart';
import 'package:mobile/features/mail/data/mail_media_cache.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

class _Media extends Mock implements MailMediaCache {}

class _Cache extends Mock implements MailCache {}

void main() {
  setUpAll(() => registerFallbackValue(Uint8List(0)));

  test(
    'cached inline image returns before one shared background refresh',
    () async {
      final api = _Api();
      final media = _Media();
      final cache = _Cache();
      when(() => cache.accessRevoked).thenReturn(ValueNotifier<String?>(null));
      final repository = MailRepository(
        apiClient: api,
        mediaCache: media,
        cache: cache,
      );
      final server = Completer<Uint8List>();
      const path =
          '/api/v1/workspaces/ws/mail/mailboxes/box/messages/msg/attachments/img';
      when(
        () => media.read('ws', 'box', 'thread', 'msg', 'img'),
      ).thenAnswer((_) async => Uint8List.fromList([1]));
      when(
        () => media.save('ws', 'box', 'thread', 'msg', 'img', any()),
      ).thenAnswer((_) async {});
      when(() => api.getBytes(path)).thenAnswer((_) => server.future);

      final first = await repository.attachment(
        'ws',
        'box',
        'msg',
        'img',
        threadId: 'thread',
        cacheInlineImage: true,
      );
      final second = await repository.attachment(
        'ws',
        'box',
        'msg',
        'img',
        threadId: 'thread',
        cacheInlineImage: true,
      );
      expect(first, [1]);
      expect(second, [1]);
      verify(() => api.getBytes(path)).called(1);

      server.complete(Uint8List.fromList([2]));
      await Future<void>.delayed(Duration.zero);
      verify(
        () => media.save('ws', 'box', 'thread', 'msg', 'img', any()),
      ).called(1);
    },
  );
}

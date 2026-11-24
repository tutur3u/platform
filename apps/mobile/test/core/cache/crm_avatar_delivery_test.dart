import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/cache/crm_avatar_delivery.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  test(
    'CRM avatar delivery uploads to the server-issued URL and returns its URL',
    () async {
      final api = _MockApiClient();
      final bytes = Uint8List.fromList([1, 2, 3]);
      when(() => api.postJson(CrmEndpoints.avatar('ws-1'), any())).thenAnswer(
        (_) async => {
          'uploadUrl':
              'https://upload.example.test/api/v1/users/me/avatar/upload?token=t',
          'token': 't',
          'path': 'ws-1/users/item.webp',
        },
      );
      when(() => api.getJson(any())).thenAnswer(
        (_) async => {'signedUrl': 'https://example.test/avatar.png'},
      );
      final client = MockClient((request) async {
        expect(request.method, 'PUT');
        // The upload host is whatever the server issued, never built here.
        expect(
          request.url.toString(),
          'https://upload.example.test/api/v1/users/me/avatar/upload?token=t',
        );
        expect(request.headers['content-type'], 'image/png');
        expect(request.bodyBytes, bytes);
        return http.Response('', 200);
      });

      final url = await deliverCrmAvatar(
        api: api,
        httpClient: client,
        workspaceId: 'ws-1',
        fileName: 'item.png',
        contentType: 'image/png',
        bytes: bytes,
      );
      expect(url, 'https://example.test/avatar.png');
      verify(() => api.postJson(CrmEndpoints.avatar('ws-1'), any())).called(1);
      verify(
        () => api.getJson(
          '${CrmEndpoints.avatar('ws-1')}?path=ws-1%2Fusers%2Fitem.webp',
        ),
      ).called(1);
      client.close();
    },
  );

  test('CRM avatar delivery refuses a ticket without an upload URL', () async {
    final api = _MockApiClient();
    when(
      () => api.postJson(CrmEndpoints.avatar('ws-1'), any()),
    ).thenAnswer((_) async => {'token': 't', 'path': 'ws-1/users/item.webp'});
    final client = MockClient((_) async => fail('must not upload'));
    await expectLater(
      deliverCrmAvatar(
        api: api,
        httpClient: client,
        workspaceId: 'ws-1',
        fileName: 'item.png',
        contentType: 'image/png',
        bytes: Uint8List.fromList([1]),
      ),
      throwsA(isA<ApiException>()),
    );
    client.close();
  });
}

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
    'CRM avatar delivery obtains a fresh token and returns its URL',
    () async {
      final api = _MockApiClient();
      final bytes = Uint8List.fromList([1, 2, 3]);
      when(() => api.postJson(CrmEndpoints.avatar('ws-1'), any())).thenAnswer(
        (_) async => {'token': 'upload-token', 'path': 'avatars/item.png'},
      );
      when(() => api.getJson(any())).thenAnswer(
        (_) async => {'signedUrl': 'https://example.test/avatar.png'},
      );
      final client = MockClient((request) async {
        expect(request.method, 'PUT');
        expect(request.url.queryParameters['token'], 'upload-token');
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
      client.close();
    },
  );
}

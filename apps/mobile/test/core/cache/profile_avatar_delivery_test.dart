import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/cache/profile_avatar_delivery.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';

class _AvatarApi extends ApiClient {
  _AvatarApi() : super(baseUrl: 'http://localhost');

  final updates = <Object?>[];

  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    expect(path, ProfileEndpoints.avatarUploadUrl);
    expect(body, {'filename': 'avatar.png'});
    return {
      'uploadUrl': 'https://upload.example.test/avatar',
      'publicUrl': 'https://cdn.example.test/avatar',
    };
  }

  @override
  Future<Map<String, dynamic>> patchJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    expect(path, ProfileEndpoints.profile);
    updates.add(body);
    return const {};
  }
}

void main() {
  test(
    'avatar replay signs fresh URL and updates profile after upload',
    () async {
      final api = _AvatarApi();
      final requests = <http.Request>[];
      final client = MockClient((request) async {
        requests.add(request);
        return http.Response('', 200);
      });
      await deliverProfileAvatar(
        api: api,
        httpClient: client,
        filename: 'avatar.png',
        contentType: 'image/png',
        encodedBytes: base64Encode([1, 2, 3]),
      );
      expect(requests.single.bodyBytes, [1, 2, 3]);
      expect(api.updates, [
        {'avatar_url': 'https://cdn.example.test/avatar'},
      ]);
      api.dispose();
      client.close();
    },
  );

  test('failed upload never changes profile', () async {
    final api = _AvatarApi();
    final client = MockClient(
      (_) async => throw const SocketException('Connection lost'),
    );
    await expectLater(
      deliverProfileAvatar(
        api: api,
        httpClient: client,
        filename: 'avatar.png',
        contentType: 'image/png',
        encodedBytes: base64Encode([1, 2, 3]),
      ),
      throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 0)),
    );
    expect(api.updates, isEmpty);
    api.dispose();
    client.close();
  });
}

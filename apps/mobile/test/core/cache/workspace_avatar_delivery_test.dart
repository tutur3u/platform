import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image/image.dart' as img;
import 'package:mobile/core/cache/workspace_avatar_delivery.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';

class _WorkspaceAvatarApi extends ApiClient {
  _WorkspaceAvatarApi() : super(baseUrl: 'http://localhost');

  final updates = <Object?>[];

  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    expect(path, WorkspaceEndpoints.avatarUploadUrl('server-ws'));
    expect(body, {'filename': 'avatar.png'});
    return {
      'uploadUrl': 'https://upload.example.test/logo',
      'token': 'fresh-token',
      'filePath': 'avatars/server-ws/logo.png',
    };
  }

  @override
  Future<Map<String, dynamic>> patchJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    expect(path, WorkspaceEndpoints.avatar('server-ws'));
    updates.add(body);
    return const {};
  }
}

void main() {
  test(
    'workspace avatar replay signs after create and patches only after upload',
    () async {
      final api = _WorkspaceAvatarApi();
      final requests = <http.Request>[];
      final client = MockClient((request) async {
        requests.add(request);
        return http.Response('', 200);
      });
      await deliverWorkspaceAvatar(
        api: api,
        httpClient: client,
        workspaceId: 'server-ws',
        filename: 'logo.png',
        contentType: 'image/png',
        encodedBytes: base64Encode(
          img.encodePng(img.Image(width: 2, height: 2)),
        ),
      );
      expect(img.decodePng(requests.single.bodyBytes)?.width, 2);
      expect(requests.single.bodyBytes.length, lessThanOrEqualTo(1000000));
      expect(requests.single.headers['content-type'], 'image/png');
      expect(requests.single.headers['authorization'], 'Bearer fresh-token');
      expect(api.updates, [
        {'filePath': 'avatars/server-ws/logo.png'},
      ]);
      api.dispose();
      client.close();
    },
  );
}

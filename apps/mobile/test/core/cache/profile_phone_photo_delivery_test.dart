import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image/image.dart' as img;
import 'package:mobile/core/cache/profile_avatar_delivery.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';

import '../../helpers/profile_media_fixtures.dart';

const _operation = '00000000-0000-4000-8000-000000000001';

class _Api extends ApiClient {
  _Api() : super(baseUrl: 'http://localhost');
  bool finalized = false;
  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    if (path == ProfileEndpoints.banner) {
      expect(body, {'action': 'finalize', 'operationId': _operation});
      finalized = true;
      return {};
    }
    expect((body! as Map)['filename'], endsWith('.jpg'));
    return {
      'operationId': _operation,
      'publicUrl': 'https://cdn.example.test/profile.webp',
      'uploadUrl': 'https://upload.example.test/profile',
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
    finalized = true;
    return {};
  }
}

void main() {
  for (final banner in [false, true]) {
    for (final tiny in [false, true]) {
      test(
        'banner=$banner tiny=$tiny uploads actual optimized bytes',
        () async {
          final source = tiny
              ? img.encodeJpg(img.Image(width: 8, height: 8))
              : phonePhoto();
          final api = _Api();
          addTearDown(api.dispose);
          var uploads = 0;
          final client = MockClient((request) async {
            uploads++;
            expect(request.method, 'PUT');
            expect(request.headers['content-type'], 'image/jpeg');
            expect(request.contentLength, request.bodyBytes.length);
            expect(
              request.contentLength,
              lessThanOrEqualTo(banner ? 2000000 : 1000000),
            );
            final decoded = img.decodeJpg(request.bodyBytes)!;
            expect(decoded.width, tiny ? 8 : (banner ? 1920 : 1024));
            return http.Response('', 200);
          });
          addTearDown(client.close);
          await deliverProfileAvatar(
            api: api,
            httpClient: client,
            filename: 'source.jpg',
            contentType: 'image/jpeg',
            encodedBytes: base64Encode(source),
            banner: banner,
            operationId: banner ? _operation : null,
          );
          expect(uploads, 1);
          expect(api.finalized, isTrue);
        },
      );
    }
  }
}

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image/image.dart' as image;
import 'package:mobile/core/cache/profile_avatar_delivery.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/media/profile_upload_failure.dart';
import 'package:mobile/data/sources/api_client.dart';

const _operation = '00000000-0000-4000-8000-000000000901';

class _Api extends ApiClient {
  _Api(this.receipt) : super(baseUrl: 'http://localhost');
  final Map<String, dynamic> receipt;
  final posts = <String>[];
  int patches = 0;
  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    posts.add(path);
    return receipt;
  }

  @override
  Future<Map<String, dynamic>> patchJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    patches++;
    return {};
  }
}

Future<void> _deliver(_Api api, http.Client client, {bool banner = true}) =>
    deliverProfileAvatar(
      api: api,
      httpClient: client,
      filename: 'profile.png',
      contentType: 'image/png',
      encodedBytes: base64Encode(
        image.encodePng(image.Image(width: 16, height: 16)),
      ),
      banner: banner,
      operationId: banner ? _operation : null,
    );

Map<String, dynamic> _receipt() => {
  'operationId': _operation,
  'publicUrl': 'https://cdn.example.test/profile.webp',
  'uploadUrl': 'https://upload.example.test/profile',
};

void main() {
  for (final (header, delay) in <(String?, int?)>[
    (null, null),
    ('malformed-value', null),
    ('-1', null),
    ('0', 0),
    (' 60 ', 60),
    ('604801', 604800),
    ('999999999999999999999999999999999999', 604800),
    ('Tue, 06 Oct 2026 12:01:00 GMT', 60),
    ('Tue, 06 Oct 2026 12:00:00 GMT', 0),
    ('Tue, 06 Oct 2026 11:59:00 GMT', 0),
    ('Tue, 13 Oct 2026 12:01:00 GMT', 604800),
  ]) {
    test('capability retry header $header yields bounded delay $delay', () {
      final failure = profileUploadHttpFailure(
        http.Response(
          '',
          429,
          headers: {if (header != null) 'retry-after': header},
        ),
        clock: () => DateTime.utc(2026, 10, 6, 12, 0, 0, 500),
      );
      expect(failure.retryAfter, delay);
      expect(failure.statusCode, 429);
      expect(failure.code, 'PROFILE_UPLOAD_LIMIT');
    });
  }

  for (final state in ['committed', 'uploaded', 'issued']) {
    for (final invalid in [
      'foreign',
      'missing',
      'malformed',
      'no-public-url',
    ]) {
      test('$state $invalid receipt cannot shortcut or write', () async {
        final receipt = _receipt();
        if (state != 'issued') receipt[state] = true;
        switch (invalid) {
          case 'foreign':
            receipt['operationId'] = '00000000-0000-4000-8000-000000000902';
          case 'missing':
            receipt.remove('operationId');
          case 'malformed':
            receipt['operationId'] = 17;
          case 'no-public-url':
            receipt.remove('publicUrl');
        }
        final api = _Api(receipt);
        var puts = 0;
        final client = MockClient((_) async {
          puts++;
          return http.Response('{}', 200);
        });
        addTearDown(api.dispose);
        addTearDown(client.close);
        await expectLater(
          _deliver(api, client),
          throwsA(
            isA<ApiException>()
                .having((e) => e.failureKind, 'kind', ApiFailureKind.response)
                .having(
                  (e) => e.code,
                  'code',
                  'PROFILE_UPLOAD_RECEIPT_INVALID',
                ),
          ),
        );
        expect(puts, 0);
        expect(api.posts, [ProfileEndpoints.bannerUploadUrl]);
        expect(api.patches, 0);
      });
    }
  }
  for (final banner in [false, true]) {
    for (final (status, code) in [
      (400, 'PROFILE_UPLOAD_IMAGE_INVALID'),
      (401, 'PROFILE_UPLOAD_AUTHORIZATION'),
      (403, 'PROFILE_UPLOAD_AUTHORIZATION'),
      (409, 'PROFILE_UPLOAD_CONFLICT'),
      (413, 'PROFILE_UPLOAD_IMAGE_TOO_LARGE'),
      (429, 'PROFILE_UPLOAD_LIMIT'),
      (500, 'PROFILE_UPLOAD_UNAVAILABLE'),
      (503, 'PROFILE_UPLOAD_UNAVAILABLE'),
      (418, 'PROFILE_UPLOAD_FAILED'),
    ]) {
      test(
        'banner=$banner PUT$status preserves safe failure without finalize',
        () async {
          final api = _Api(_receipt());
          final client = MockClient(
            (_) async => http.Response(
              '{"message":"synthetic-sensitive-detail",'
              '"code":"synthetic-arbitrary-code"}',
              status,
              headers: {'retry-after': '60'},
            ),
          );
          addTearDown(api.dispose);
          addTearDown(client.close);
          await expectLater(
            _deliver(api, client, banner: banner),
            throwsA(
              isA<ApiException>()
                  .having((e) => e.statusCode, 'status', status)
                  .having((e) => e.code, 'safe code', code)
                  .having((e) => e.retryAfter, 'retry', 60)
                  .having((e) => e.failureKind, 'kind', ApiFailureKind.http)
                  .having(
                    (e) => e.toString().contains('synthetic-'),
                    'no arbitrary response values',
                    false,
                  ),
            ),
          );
          expect(api.posts, [
            if (banner)
              ProfileEndpoints.bannerUploadUrl
            else
              ProfileEndpoints.avatarUploadUrl,
          ]);
          expect(api.patches, 0);
        },
      );
    }
  }
}

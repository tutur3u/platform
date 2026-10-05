import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image/image.dart' as image;
import 'package:mobile/core/cache/profile_avatar_delivery.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';

class _BannerApi extends ApiClient {
  _BannerApi() : super(baseUrl: 'http://localhost');
  final calls = <Map<String, dynamic>>[];
  bool committed = false;
  bool uploaded = false;
  bool loseFinalizeResponse = false;
  int transitions = 0;
  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    final payload = Map<String, dynamic>.from(body! as Map);
    calls.add({'path': path, ...payload});
    if (path == ProfileEndpoints.bannerUploadUrl) {
      return {
        'committed': committed,
        'uploaded': uploaded,
        'operationId': payload['operationId'],
        'uploadUrl': 'https://storage.example.test/upload',
        'publicUrl': 'https://storage.example.test/public/banner',
      };
    }
    expect(path, ProfileEndpoints.banner);
    expect(payload['operationId'], '00000000-0000-4000-8000-000000000901');
    if (!committed) {
      committed = true;
      transitions++;
    }
    if (loseFinalizeResponse) {
      loseFinalizeResponse = false;
      throw const ApiException.transport(message: 'Synthetic lost response');
    }
    return {'committed': true};
  }
}

void main() {
  for (final uploaded in [false, true]) {
    test(
      'stable receipt uploaded=$uploaded avoids generic profile mutation',
      () async {
        final api = _BannerApi()..uploaded = uploaded;
        var puts = 0;
        final client = MockClient((request) async {
          puts++;
          return http.Response('', 200);
        });
        await deliverProfileAvatar(
          api: api,
          httpClient: client,
          filename: 'banner.png',
          contentType: 'image/png',
          encodedBytes: base64Encode(
            image.encodePng(image.Image(width: 16, height: 16)),
          ),
          banner: true,
          operationId: '00000000-0000-4000-8000-000000000901',
        );
        expect(puts, uploaded ? 0 : 1);
        expect(api.transitions, 1);
        expect(api.calls.last['action'], 'finalize');
        api.dispose();
        client.close();
      },
    );
  }
  test(
    'lost finalize response replay keeps operation ID and applies exactly once',
    () async {
      final api = _BannerApi()..loseFinalizeResponse = true;
      var puts = 0;
      final client = MockClient((request) async {
        puts++;
        return http.Response('', 200);
      });
      Future<void> deliver() => deliverProfileAvatar(
        api: api,
        httpClient: client,
        filename: 'banner.png',
        contentType: 'image/png',
        encodedBytes: base64Encode(
          image.encodePng(image.Image(width: 16, height: 16)),
        ),
        banner: true,
        operationId: '00000000-0000-4000-8000-000000000901',
      );
      await expectLater(deliver(), throwsA(isA<ApiException>()));
      await deliver();
      expect(api.transitions, 1);
      expect(puts, 1);
      expect(
        api.calls
            .where((call) => call['path'] == ProfileEndpoints.bannerUploadUrl)
            .map((call) => call['operationId'])
            .toSet(),
        hasLength(1),
      );
      api.dispose();
      client.close();
    },
  );
}

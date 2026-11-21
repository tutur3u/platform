import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_review_fetch.dart';

final _png = Uint8List.fromList([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, //
]);
final Uri _url = Uri.parse('https://cdn.tuturuuu.com/m/inbox.png');

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#design-review-asks
void main() {
  test('fetches a hosted preview without credentials or redirects', () async {
    late http.BaseRequest seen;
    final client = MockClient.streaming((request, _) async {
      seen = request;
      return http.StreamedResponse(Stream.value(_png), 200);
    });
    expect(await fleetFetchHostedReviewImage(_url, client: client), _png);
    expect(seen.followRedirects, isFalse);
    expect(seen.headers.containsKey('authorization'), isFalse);
  });

  test(
    'refuses redirects, oversized bodies, non-images and other hosts',
    () async {
      Future<Object?> fetch(http.StreamedResponse response, [Uri? url]) async {
        final client = MockClient.streaming((_, _) async => response);
        try {
          await fleetFetchHostedReviewImage(url ?? _url, client: client);
          return null;
        } on Object catch (error) {
          return error;
        }
      }

      expect(
        await fetch(
          http.StreamedResponse(
            const Stream.empty(),
            302,
            headers: {'location': 'https://evil.example/x.png'},
          ),
        ),
        isNotNull,
      );
      expect(
        await fetch(
          http.StreamedResponse(Stream.value(Uint8List(300 * 1024)), 200),
        ),
        isNotNull,
      );
      expect(
        await fetch(
          http.StreamedResponse(Stream.value('<svg/>'.codeUnits), 200),
        ),
        isNotNull,
      );
      expect(
        await fetch(
          http.StreamedResponse(Stream.value(_png), 200),
          Uri.parse('https://evil.example/x.png'),
        ),
        isNotNull,
      );
    },
  );

  test('sniffs PNG, JPEG and WebP only', () {
    expect(fleetSniffReviewImage(_png), 'image/png');
    expect(
      fleetSniffReviewImage(Uint8List.fromList([0xff, 0xd8, 0xff, 0xe0])),
      'image/jpeg',
    );
    expect(
      fleetSniffReviewImage(Uint8List.fromList('GIF89a'.codeUnits)),
      isNull,
    );
  });
}

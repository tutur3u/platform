import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/bounded_stream_error.dart';

void main() {
  test(
    'oversized body cancels source and preserves status/headers only',
    () async {
      var canceled = false;
      final stream = StreamController<List<int>>(
        onCancel: () {
          canceled = true;
        },
      );
      final read = readBoundedStreamError(
        http.StreamedResponse(
          stream.stream,
          429,
          headers: {'retry-after': '60'},
        ),
      );
      stream.add(List.filled(64 * 1024 + 1, 65));
      final response = await read;
      expect(canceled, isTrue);
      expect(response.statusCode, 429);
      expect(response.headers['retry-after'], '60');
      expect(response.body, isEmpty);
      await stream.close();
    },
  );
  test('chunked exact-limit body is retained; overflow is discarded', () async {
    for (final overflow in [false, true]) {
      final response = await readBoundedStreamError(
        http.StreamedResponse(
          Stream.fromIterable([
            List.filled(32 * 1024, 65),
            List.filled(32 * 1024, 66),
            if (overflow) [67],
          ]),
          503,
        ),
      );
      expect(response.bodyBytes.length, overflow ? 0 : 64 * 1024);
    }
  });
  test('small structured errors retain their payload', () async {
    final response = await readBoundedStreamError(
      http.StreamedResponse(
        Stream.value(utf8.encode('{"error":"synthetic"}')),
        403,
      ),
    );
    expect(response.body, '{"error":"synthetic"}');
  });
}

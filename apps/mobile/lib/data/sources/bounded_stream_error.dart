import 'dart:typed_data';

import 'package:http/http.dart' as http;

/// Error payloads are bounded; oversized bodies become generic status failures.
/// Breaking the loop cancels the source subscription, retaining only headers.
Future<http.Response> readBoundedStreamError(
  http.StreamedResponse response,
) async {
  const maxBytes = 64 * 1024;
  final bytes = BytesBuilder(copy: false);
  var oversized = false;
  await for (final chunk in response.stream) {
    if (bytes.length + chunk.length > maxBytes) {
      oversized = true;
      break;
    }
    bytes.add(chunk);
  }
  return http.Response.bytes(
    oversized ? const <int>[] : bytes.takeBytes(),
    response.statusCode,
    headers: response.headers,
    request: response.request,
    reasonPhrase: response.reasonPhrase,
    isRedirect: response.isRedirect,
    persistentConnection: response.persistentConnection,
  );
}

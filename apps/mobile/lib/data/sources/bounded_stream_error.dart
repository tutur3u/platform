import 'dart:async';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

/// Error payloads have a byte and total-time bound. Expiry or overflow cancels
/// the source subscription and retains only the HTTP status and headers.
Future<http.Response> readBoundedStreamError(
  http.StreamedResponse response, {
  Duration timeout = const Duration(seconds: 30),
  Future<void>? stop,
}) async {
  const maxBytes = 64 * 1024;
  final bytes = BytesBuilder(copy: false);
  final completed = Completer<void>();
  var discard = false;
  late StreamSubscription<List<int>> subscription;
  void finish({bool discardBody = false}) {
    if (completed.isCompleted) return;
    discard = discardBody;
    completed.complete();
  }

  subscription = response.stream.listen(
    (chunk) {
      if (completed.isCompleted) return;
      if (bytes.length + chunk.length > maxBytes) {
        finish(discardBody: true);
      } else {
        bytes.add(chunk);
      }
    },
    onDone: finish,
    onError: (Object error, StackTrace stack) {
      finish(discardBody: true);
    },
  );
  final timer = Timer(timeout, () => finish(discardBody: true));
  if (stop != null) {
    unawaited(stop.then((_) => finish(discardBody: true)));
  }
  try {
    await completed.future;
  } finally {
    timer.cancel();
    // Request cancellation without waiting for unbounded transport cleanup.
    subscription.cancel().ignore();
  }
  return http.Response.bytes(
    discard ? const <int>[] : bytes.takeBytes(),
    response.statusCode,
    headers: response.headers,
    request: response.request,
    reasonPhrase: response.reasonPhrase,
    isRedirect: response.isRedirect,
    persistentConnection: response.persistentConnection,
  );
}

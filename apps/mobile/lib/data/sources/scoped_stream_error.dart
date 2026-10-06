import 'dart:async';

import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/data/sources/bounded_stream_error.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// A departed actor cannot reclaim an old error body by logging back in.
Future<http.Response> readScopedStreamError(
  http.StreamedResponse response, {
  required Duration timeout,
  GoTrueClient? auth,
  String? userId,
}) async {
  if (auth == null) {
    return await readBoundedStreamError(response, timeout: timeout);
  }
  final stopped = Completer<void>();
  var departed = userId == null || auth.currentUser?.id != userId;
  void stop() {
    departed = true;
    if (!stopped.isCompleted) stopped.complete();
  }

  final subscription = auth.onAuthStateChange.listen((state) {
    if (state.event == AuthChangeEvent.signedOut ||
        state.session?.user.id != userId) {
      stop();
    }
  }, onError: (Object error, StackTrace stack) => stop());
  try {
    if (departed) stop();
    final failure = await readBoundedStreamError(
      response,
      timeout: timeout,
      stop: stopped.future,
    );
    if (departed || auth.currentUser?.id != userId) {
      throw const ApiException(
        message: 'Account changed during request',
        statusCode: 401,
      );
    }
    return failure;
  } finally {
    subscription.cancel().ignore();
  }
}

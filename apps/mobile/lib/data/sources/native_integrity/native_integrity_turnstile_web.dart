import 'dart:async';
import 'dart:js_interop';

import 'package:web/web.dart' as web;

Future<String> requestIntegrityTurnstile(Uri base, String hash) async {
  final result = Completer<String>();
  final url = base.replace(
    queryParameters: {
      ...base.queryParameters,
      'requestHash': hash,
      'parentOrigin': web.window.location.origin,
    },
  );
  final frame = web.HTMLIFrameElement()..src = url.toString();
  frame.style.display = 'none';
  void message(web.MessageEvent event) {
    if (event.origin != base.origin || event.source != frame.contentWindow) {
      return;
    }
    final data = event.data.dartify();
    if (data is! Map ||
        data['type'] != 'tuturuuu-native-integrity' ||
        data['requestHash'] != hash) {
      return;
    }
    final token = data['token'];
    if (token is String &&
        token.isNotEmpty &&
        token.length <= 4096 &&
        !result.isCompleted) {
      result.complete(token);
    }
  }

  final callback = ((web.Event event) {
    message(event as web.MessageEvent);
  }).toJS;
  web.window.addEventListener('message', callback);
  web.document.body?.append(frame);
  try {
    return await result.future.timeout(const Duration(seconds: 20));
  } finally {
    web.window.removeEventListener('message', callback);
    frame.remove();
  }
}

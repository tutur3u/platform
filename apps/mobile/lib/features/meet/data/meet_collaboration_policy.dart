import 'dart:convert';

/// Native bridge authorization, independent of WebView/plugin lifecycle.
class MeetCollaborationPolicy {
  MeetCollaborationPolicy({required this.editor, required this.nonce});
  final Uri editor;
  final String nonce;

  bool allowsNavigation(Uri url) =>
      url.origin == editor.origin &&
      url.path == editor.path &&
      url.queryParameters['meetingId'] == editor.queryParameters['meetingId'];

  ({String action, Object? payload}) authorize({
    required List<dynamic> arguments,
    required Uri? currentUrl,
    required bool ended,
    required String admission,
  }) {
    if (arguments.length < 2 ||
        arguments.length > 3 ||
        arguments[0] != nonce ||
        arguments[1] is! String ||
        ended ||
        admission != 'admitted') {
      throw StateError('Room access denied');
    }
    if (currentUrl == null || !allowsNavigation(currentUrl)) {
      throw StateError('Invalid editor origin');
    }
    final action = arguments[1] as String;
    if (!const {
      'room',
      'document',
      'programming',
      'readRun',
      'readTest',
      'select',
      'create',
      'run',
      'test',
      'checkpoint',
    }.contains(action)) {
      throw const FormatException('Unknown collaboration action');
    }
    final payload = arguments.length > 2 ? arguments[2] : null;
    if (utf8.encode(jsonEncode(payload)).length > 3000000) {
      throw const FormatException('Frame exceeds limit');
    }
    if (const {'readRun', 'readTest'}.contains(action) &&
        (payload is! Map ||
            payload['id'] is! String ||
            !RegExp(
              r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$',
            ).hasMatch(payload['id'] as String))) {
      throw const FormatException('Invalid resource');
    }
    return (action: action, payload: payload);
  }
}

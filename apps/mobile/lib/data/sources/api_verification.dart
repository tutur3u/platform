import 'dart:async';

/// Bridges an explicit server step-up challenge to the app's security check.
/// A token is scoped to one retry, never shared with concurrent requests.
///
/// [requestToken] first tries a background (invisible) Turnstile solve. It
/// may show the interactive check only when [allowsPrompt] is true for the
/// asking request: writes and explicit offline downloads. Plain reads and
/// navigation never interrupt the user; their step-up resolves in the
/// background or fails like any other request. The server still verifies
/// every token, so this only decides when the user is asked.
class ApiVerification {
  static Future<String?> Function()? requestToken;
  static final Object _tokenKey = Object();
  static final Object _promptKey = Object();

  static String? get token => Zone.current[_tokenKey] as String?;

  /// Whether the request asking for a token may show the interactive check.
  static bool get allowsPrompt => Zone.current[_promptKey] != false;

  /// Asks [requestToken] for one token, allowing the interactive check only
  /// when [allowPrompt] is true.
  static Future<String?> request({required bool allowPrompt}) async {
    final ask = requestToken;
    if (ask == null) return null;
    return await runZoned(ask, zoneValues: {_promptKey: allowPrompt});
  }

  /// Whether a request with HTTP [method] may prompt: anything but a plain
  /// read, or a read inside an explicit offline download ([bulkRead]).
  /// An unknown method keeps the prompt, so no write loses its fallback.
  static bool promptsFor(String? method, {required bool bulkRead}) {
    final normalized = method?.toUpperCase();
    final read = normalized == 'GET' || normalized == 'HEAD';
    return !read || bulkRead;
  }

  static Future<T> retry<T>(String token, Future<T> Function() request) =>
      runZoned(request, zoneValues: {_tokenKey: token});
}

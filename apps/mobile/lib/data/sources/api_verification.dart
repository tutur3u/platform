import 'dart:async';

/// Bridges an explicit server step-up challenge to the app's security dialog.
/// A token is scoped to one retry, never shared with concurrent requests.
class ApiVerification {
  static Future<String?> Function()? requestToken;
  static final Object _tokenKey = Object();

  static String? get token => Zone.current[_tokenKey] as String?;

  static Future<T> retry<T>(String token, Future<T> Function() request) =>
      runZoned(request, zoneValues: {_tokenKey: token});
}

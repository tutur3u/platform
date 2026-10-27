import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Reads the signed-in owner's Supabase session on every call. The token is
/// handed straight to the request; this class keeps no copy and logs nothing.
final class SupabaseAccessTokenProvider implements AccessTokenProvider {
  const SupabaseAccessTokenProvider();

  @override
  Future<String?> currentAccessToken() async =>
      maybeSupabase?.auth.currentSession?.accessToken;

  /// Null only when the session is gone. A client that is not initialised yet
  /// or a retryable failure throws, so the caller keeps its cache.
  @override
  Future<String?> refreshAccessToken() async {
    final auth = maybeSupabase?.auth;
    if (auth == null) {
      throw StateError('The Supabase client is not initialised.');
    }
    try {
      return (await auth.refreshSession()).session?.accessToken;
    } on Object catch (error) {
      if (isSessionGoneError(error)) return null;
      rethrow;
    }
  }
}

/// Whether a failed refresh proves the session cannot be renewed: no session or
/// refresh token, or an auth server answer rejecting the refresh token.
/// Network errors, timeouts, 429 and 5xx are retryable and are not "gone".
bool isSessionGoneError(Object error) {
  if (error is AuthSessionMissingException) return true;
  if (error is AuthApiException) {
    return const {'400', '401', '403', '404', '422'}.contains(error.statusCode);
  }
  return false;
}

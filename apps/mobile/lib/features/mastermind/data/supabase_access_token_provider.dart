import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';

/// Reads the signed-in owner's Supabase session on every call. The token is
/// handed straight to the request; this class keeps no copy and logs nothing.
final class SupabaseAccessTokenProvider implements AccessTokenProvider {
  const SupabaseAccessTokenProvider();

  @override
  Future<String?> currentAccessToken() async =>
      maybeSupabase?.auth.currentSession?.accessToken;

  @override
  Future<String?> refreshAccessToken() async {
    final auth = maybeSupabase?.auth;
    if (auth == null) return null;
    try {
      return (await auth.refreshSession()).session?.accessToken;
    } on Object {
      return null;
    }
  }
}

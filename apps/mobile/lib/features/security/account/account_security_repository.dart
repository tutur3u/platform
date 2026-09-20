import 'package:mobile/data/sources/api_client.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AccountSession {
  const AccountSession({
    required this.id,
    required this.label,
    required this.current,
    this.lastActive,
    this.ip,
  });
  factory AccountSession.fromJson(Map<String, dynamic> json) => AccountSession(
    id: json['session_id'] as String,
    label: json['user_agent'] as String? ?? '',
    current: json['is_current'] == true,
    lastActive: DateTime.tryParse(json['updated_at'] as String? ?? ''),
    ip: json['ip'] as String?,
  );
  final String id;
  final String label;
  final bool current;
  final DateTime? lastActive;
  final String? ip;
}

class AccountSecurityRepository {
  AccountSecurityRepository({ApiClient? api, SupabaseClient? client})
    : _api = api ?? ApiClient(),
      _client = client ?? Supabase.instance.client;
  final ApiClient _api;
  final SupabaseClient _client;

  Future<List<AccountSession>> sessions() async {
    final response = await _api.getJson('/api/v1/users/sessions');
    return (response['sessions'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(AccountSession.fromJson)
        .toList();
  }

  Future<void> revoke(String id) async {
    await _api.deleteJson('/api/v1/users/sessions/${Uri.encodeComponent(id)}');
  }

  Future<void> revokeOthers() async {
    await _api.deleteJson('/api/v1/users/sessions');
  }

  Future<List<UserIdentity>> identities() => _client.auth.getUserIdentities();
  Future<void> unlink(UserIdentity identity) async {
    final userId = _client.auth.currentUser?.id;
    final current = await identities();
    if (userId == null || _client.auth.currentUser?.id != userId) {
      throw const AuthException('Account changed');
    }
    if (current.length < 2) throw const AuthException('Keep a sign-in method');
    final match = current.where((item) => item.id == identity.id).firstOrNull;
    if (match == null) throw const AuthException('Connection no longer exists');
    await _client.auth.unlinkIdentity(match);
  }

  Future<void> link(OAuthProvider provider) async {
    final userId = _client.auth.currentUser?.id;
    final info = await PackageInfo.fromPlatform();
    if (userId == null || _client.auth.currentUser?.id != userId) {
      throw const AuthException('Account changed');
    }
    await _client.auth.linkIdentity(
      provider,
      redirectTo: '${info.packageName}://login-callback',
      scopes: provider == OAuthProvider.azure ? 'email' : null,
    );
  }
}

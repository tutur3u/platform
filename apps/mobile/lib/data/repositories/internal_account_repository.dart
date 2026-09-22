import 'package:mobile/data/sources/api_client.dart';

/// Administrative account data is kept in memory only. Passwords are never
/// returned by the server, cached, or included in diagnostic messages.
class InternalAccount {
  const InternalAccount({
    required this.id,
    required this.email,
    required this.isDisabled,
    required this.isSelf,
    this.displayName,
    this.username,
    this.lastSignInAt,
  });

  factory InternalAccount.fromJson(Map<String, dynamic> json) =>
      InternalAccount(
        id: json['id'] as String,
        email: json['email'] as String,
        isDisabled: json['isDisabled'] as bool,
        isSelf: json['isSelf'] as bool,
        displayName: json['displayName'] as String?,
        username: json['username'] as String?,
        lastSignInAt: DateTime.tryParse(json['lastSignInAt'] as String? ?? ''),
      );

  final String id;
  final String email;
  final bool isDisabled;
  final bool isSelf;
  final String? displayName;
  final String? username;
  final DateTime? lastSignInAt;
}

class InternalAccountPage {
  const InternalAccountPage({
    required this.accounts,
    required this.count,
    required this.nextCursor,
  });

  final List<InternalAccount> accounts;
  final int count;
  final String? nextCursor;
}

class InternalAccountRepository {
  InternalAccountRepository({ApiClient? apiClient})
    : _client = apiClient ?? ApiClient(),
      _ownsClient = apiClient == null;

  static const endpoint = '/api/v1/infrastructure/internal-accounts';
  final ApiClient _client;
  final bool _ownsClient;

  Future<InternalAccountPage> list({String query = '', String? cursor}) async {
    final parameters = <String, String>{
      'limit': '50',
      // Administrators must also be able to find disabled or pending accounts.
      'activeOnly': 'false',
      'verifiedOnly': 'false',
      if (query.trim().isNotEmpty) 'q': query.trim(),
      if (cursor != null) 'cursor': cursor,
    };
    final response = await _client.getJson(
      '$endpoint?${Uri(queryParameters: parameters).query}',
    );
    return InternalAccountPage(
      accounts: (response['accounts'] as List<dynamic>)
          .map(
            (value) => InternalAccount.fromJson(value as Map<String, dynamic>),
          )
          .toList(growable: false),
      count: response['count'] as int,
      nextCursor: response['nextCursor'] as String?,
    );
  }

  Future<InternalAccount> setAccess(
    InternalAccount account, {
    required bool enabled,
    required String confirmationEmail,
  }) => _update(account.id, {
    'action': enabled ? 'enable_access' : 'disable_access',
    'confirmationEmail': confirmationEmail.trim(),
  });

  Future<InternalAccount> resetPassword(
    InternalAccount account, {
    required String password,
    required String confirmationEmail,
  }) => _update(account.id, {
    'action': 'reset_password',
    'confirmationEmail': confirmationEmail.trim(),
    'newPassword': password,
  });

  Future<InternalAccount> resetAuthenticators(
    InternalAccount account, {
    required String confirmationEmail,
  }) => _update(account.id, {
    'action': 'reset_mfa',
    'confirmationEmail': confirmationEmail.trim(),
  });

  Future<InternalAccount> updateProfile(
    InternalAccount account, {
    required String displayName,
    required String? username,
  }) => _update(account.id, {
    'action': 'update_profile',
    'displayName': displayName.trim(),
    'username': username?.trim().isEmpty ?? true ? null : username!.trim(),
  });

  Future<InternalAccount> _update(String id, Map<String, dynamic> body) async {
    final response = await _client.patchJson(
      '$endpoint/${Uri.encodeComponent(id)}',
      body,
    );
    return InternalAccount.fromJson(
      response['account'] as Map<String, dynamic>,
    );
  }

  void dispose() {
    if (_ownsClient) _client.dispose();
  }
}

import 'package:mobile/data/models/stored_auth_account.dart';

class MultiAccountStore {
  const MultiAccountStore({
    required this.accounts,
    required this.activeAccountId,
    required this.version,
  });

  factory MultiAccountStore.empty() {
    return const MultiAccountStore(
      accounts: <StoredAuthAccount>[],
      activeAccountId: null,
      version: 1,
    );
  }

  factory MultiAccountStore.fromJson(Map<String, dynamic> json) {
    return MultiAccountStore(
      accounts: (json['accounts'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(StoredAuthAccount.fromJson)
          .toList(),
      activeAccountId: json['activeAccountId'] as String?,
      version: (json['version'] as int?) ?? 1,
    );
  }

  final List<StoredAuthAccount> accounts;
  final String? activeAccountId;
  final int version;

  Map<String, dynamic> toJson() {
    return {
      'accounts': accounts.map((account) => account.toJson()).toList(),
      'activeAccountId': activeAccountId,
      'version': version,
    };
  }

  MultiAccountStore copyWith({
    List<StoredAuthAccount>? accounts,
    Object? activeAccountId = _sentinel,
    int? version,
  }) {
    return MultiAccountStore(
      accounts: accounts ?? this.accounts,
      activeAccountId: activeAccountId == _sentinel
          ? this.activeAccountId
          : activeAccountId as String?,
      version: version ?? this.version,
    );
  }

  static const Object _sentinel = Object();
}

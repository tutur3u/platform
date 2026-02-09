import 'package:equatable/equatable.dart';

/// A connected calendar provider account (Google or Microsoft).
///
/// Maps to a row in `calendar_auth_tokens` returned by
/// `GET /api/v1/calendar/auth/accounts`.
class CalendarAccount extends Equatable {
  const CalendarAccount({
    required this.id,
    required this.provider,
    this.accountEmail,
    this.accountName,
    this.isActive = true,
    this.createdAt,
    this.expiresAt,
  });

  factory CalendarAccount.fromJson(Map<String, dynamic> json) {
    return CalendarAccount(
      id: json['id'] as String,
      provider: json['provider'] as String,
      accountEmail: json['account_email'] as String?,
      accountName: json['account_name'] as String?,
      isActive: json['is_active'] as bool? ?? true,
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'] as String)
          : null,
      expiresAt: json['expires_at'] != null
          ? DateTime.parse(json['expires_at'] as String)
          : null,
    );
  }

  final String id;
  final String provider; // 'google' | 'microsoft'
  final String? accountEmail;
  final String? accountName;
  final bool isActive;
  final DateTime? createdAt;
  final DateTime? expiresAt;

  /// Human-readable display name — prefers the account name, falls back
  /// to the email, and finally to the provider name.
  String get displayName =>
      accountName ?? accountEmail ?? provider.toUpperCase();

  @override
  List<Object?> get props => [
    id,
    provider,
    accountEmail,
    accountName,
    isActive,
    createdAt,
    expiresAt,
  ];
}

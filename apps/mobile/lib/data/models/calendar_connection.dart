import 'package:equatable/equatable.dart';

/// A calendar within a connected provider account.
///
/// Maps to a row in `calendar_connections` returned by
/// `GET /api/v1/calendar/connections`.
class CalendarConnection extends Equatable {
  const CalendarConnection({
    required this.id,
    required this.wsId,
    required this.calendarId,
    required this.calendarName,
    this.isEnabled = true,
    this.color,
    this.provider,
    this.authTokenId,
    this.createdAt,
    this.updatedAt,
  });

  factory CalendarConnection.fromJson(Map<String, dynamic> json) {
    return CalendarConnection(
      id: json['id'] as String,
      wsId: json['ws_id'] as String,
      calendarId: json['calendar_id'] as String,
      calendarName: json['calendar_name'] as String,
      isEnabled: json['is_enabled'] as bool? ?? true,
      color: json['color'] as String?,
      provider: json['provider'] as String?,
      authTokenId: json['auth_token_id'] as String?,
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'] as String)
          : null,
      updatedAt: json['updated_at'] != null
          ? DateTime.parse(json['updated_at'] as String)
          : null,
    );
  }

  final String id;
  final String wsId;
  final String calendarId;
  final String calendarName;
  final bool isEnabled;
  final String? color;
  final String? provider; // 'google' | 'microsoft'
  final String? authTokenId;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  CalendarConnection copyWith({
    bool? isEnabled,
    String? calendarName,
    String? color,
  }) {
    return CalendarConnection(
      id: id,
      wsId: wsId,
      calendarId: calendarId,
      calendarName: calendarName ?? this.calendarName,
      isEnabled: isEnabled ?? this.isEnabled,
      color: color ?? this.color,
      provider: provider,
      authTokenId: authTokenId,
      createdAt: createdAt,
      updatedAt: updatedAt,
    );
  }

  @override
  List<Object?> get props => [
    id,
    wsId,
    calendarId,
    calendarName,
    isEnabled,
    color,
    provider,
    authTokenId,
    createdAt,
    updatedAt,
  ];
}

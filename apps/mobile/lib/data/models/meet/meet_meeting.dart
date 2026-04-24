import 'package:equatable/equatable.dart';

String _stringValue(Object? value, {String fallback = ''}) {
  if (value is String) return value;
  return fallback;
}

DateTime? _dateValue(Object? value) {
  if (value is String && value.isNotEmpty) {
    return DateTime.tryParse(value);
  }
  return null;
}

Map<String, dynamic> _mapValue(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, val) => MapEntry(key.toString(), val));
  }
  return const <String, dynamic>{};
}

class MeetRecordingSession extends Equatable {
  const MeetRecordingSession({
    required this.id,
    required this.status,
    this.createdAt,
    this.updatedAt,
  });

  factory MeetRecordingSession.fromJson(Map<String, dynamic> json) {
    return MeetRecordingSession(
      id: _stringValue(json['id']),
      status: _stringValue(json['status'], fallback: 'unknown'),
      createdAt: _dateValue(json['created_at']),
      updatedAt: _dateValue(json['updated_at']),
    );
  }

  final String id;
  final String status;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  @override
  List<Object?> get props => [id, status, createdAt, updatedAt];
}

class MeetMeeting extends Equatable {
  const MeetMeeting({
    required this.id,
    required this.name,
    required this.time,
    required this.recordingSessions,
    this.creatorName = '',
    this.createdAt,
  });

  factory MeetMeeting.fromJson(Map<String, dynamic> json) {
    final creator = _mapValue(json['creator']);
    return MeetMeeting(
      id: _stringValue(json['id']),
      name: _stringValue(json['name'], fallback: 'Untitled meeting'),
      time: _dateValue(json['time']) ?? DateTime.now(),
      createdAt: _dateValue(json['created_at']),
      creatorName: _stringValue(creator['display_name']),
      recordingSessions:
          (json['recording_sessions'] as List<dynamic>? ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(MeetRecordingSession.fromJson)
              .toList(growable: false),
    );
  }

  final String id;
  final String name;
  final DateTime time;
  final DateTime? createdAt;
  final String creatorName;
  final List<MeetRecordingSession> recordingSessions;

  MeetMeeting copyWith({
    String? id,
    String? name,
    DateTime? time,
    DateTime? createdAt,
    String? creatorName,
    List<MeetRecordingSession>? recordingSessions,
  }) {
    return MeetMeeting(
      id: id ?? this.id,
      name: name ?? this.name,
      time: time ?? this.time,
      createdAt: createdAt ?? this.createdAt,
      creatorName: creatorName ?? this.creatorName,
      recordingSessions: recordingSessions ?? this.recordingSessions,
    );
  }

  @override
  List<Object?> get props => [
    id,
    name,
    time,
    createdAt,
    creatorName,
    recordingSessions,
  ];
}

class MeetMeetingsPage extends Equatable {
  const MeetMeetingsPage({
    required this.meetings,
    required this.totalCount,
    required this.page,
    required this.pageSize,
  });

  factory MeetMeetingsPage.fromJson(Map<String, dynamic> json) {
    return MeetMeetingsPage(
      meetings: (json['meetings'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(MeetMeeting.fromJson)
          .toList(growable: false),
      totalCount: json['totalCount'] as int? ?? 0,
      page: json['page'] as int? ?? 1,
      pageSize: json['pageSize'] as int? ?? 20,
    );
  }

  final List<MeetMeeting> meetings;
  final int totalCount;
  final int page;
  final int pageSize;

  @override
  List<Object?> get props => [meetings, totalCount, page, pageSize];
}

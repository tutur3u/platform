import 'package:equatable/equatable.dart';

class TimeTrackingBreak extends Equatable {
  const TimeTrackingBreak({
    required this.id,
    this.sessionId,
    this.breakTypeId,
    this.breakTypeName,
    this.breakStart,
    this.breakEnd,
    this.breakDurationSeconds,
    this.notes,
    this.createdBy,
  });

  factory TimeTrackingBreak.fromJson(Map<String, dynamic> json) =>
      TimeTrackingBreak(
        id: json['id'] as String,
        sessionId: json['session_id'] as String?,
        breakTypeId: json['break_type_id'] as String?,
        breakTypeName: json['break_type_name'] as String?,
        breakStart: json['break_start'] != null
            ? DateTime.parse(json['break_start'] as String)
            : null,
        breakEnd: json['break_end'] != null
            ? DateTime.parse(json['break_end'] as String)
            : null,
        breakDurationSeconds: json['break_duration_seconds'] as int?,
        notes: json['notes'] as String?,
        createdBy: json['created_by'] as String?,
      );

  final String id;
  final String? sessionId;
  final String? breakTypeId;
  final String? breakTypeName;
  final DateTime? breakStart;
  final DateTime? breakEnd;
  final int? breakDurationSeconds;
  final String? notes;
  final String? createdBy;

  bool get isActive => breakStart != null && breakEnd == null;

  @override
  List<Object?> get props => [
    id,
    sessionId,
    breakTypeId,
    breakTypeName,
    breakStart,
    breakEnd,
    breakDurationSeconds,
    notes,
    createdBy,
  ];
}

import 'package:equatable/equatable.dart';

class CalendarEvent extends Equatable {
  const CalendarEvent({
    required this.id,
    this.title,
    this.description,
    this.startAt,
    this.endAt,
    this.color,
    this.isAllDay,
    this.wsId,
    this.createdAt,
  });

  factory CalendarEvent.fromJson(Map<String, dynamic> json) => CalendarEvent(
        id: json['id'] as String,
        title: json['title'] as String?,
        description: json['description'] as String?,
        startAt: json['start_at'] != null
            ? DateTime.parse(json['start_at'] as String)
            : null,
        endAt: json['end_at'] != null
            ? DateTime.parse(json['end_at'] as String)
            : null,
        color: json['color'] as String?,
        isAllDay: json['is_all_day'] as bool? ?? false,
        wsId: json['ws_id'] as String?,
        createdAt: json['created_at'] != null
            ? DateTime.parse(json['created_at'] as String)
            : null,
      );

  final String id;
  final String? title;
  final String? description;
  final DateTime? startAt;
  final DateTime? endAt;
  final String? color;
  final bool? isAllDay;
  final String? wsId;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'description': description,
        'start_at': startAt?.toIso8601String(),
        'end_at': endAt?.toIso8601String(),
        'color': color,
        'is_all_day': isAllDay,
        'ws_id': wsId,
        'created_at': createdAt?.toIso8601String(),
      };

  @override
  List<Object?> get props =>
      [id, title, description, startAt, endAt, color, isAllDay, wsId];
}

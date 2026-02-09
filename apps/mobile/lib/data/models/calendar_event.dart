import 'package:equatable/equatable.dart';

const _sentinel = Object();

/// Milliseconds in exactly 24 hours.
const _msPerDay = 24 * 60 * 60 * 1000;

class CalendarEvent extends Equatable {
  const CalendarEvent({
    required this.id,
    this.title,
    this.description,
    this.startAt,
    this.endAt,
    this.color,
    this.wsId,
    this.createdAt,
  });

  factory CalendarEvent.fromJson(Map<String, dynamic> json) {
    final rawStart = json['start_at'] != null
        ? DateTime.parse(json['start_at'] as String)
        : null;
    final rawEnd = json['end_at'] != null
        ? DateTime.parse(json['end_at'] as String)
        : null;

    // Detect all-day events from the UTC representation (exact 24h multiple).
    final allDay =
        rawStart != null &&
        rawEnd != null &&
        rawEnd.difference(rawStart).inMilliseconds > 0 &&
        rawEnd.difference(rawStart).inMilliseconds % _msPerDay == 0;

    // For all-day events, use the UTC date at local midnight so the event
    // stays on the correct calendar day regardless of timezone offset.
    // E.g. UTC 00:00 Feb 1 → 00:00 Feb 2 in GMT+7 becomes local midnight
    // Feb 1 → midnight Feb 2 (shows on Feb 1 only).
    final DateTime? startAt;
    final DateTime? endAt;
    if (allDay) {
      // allDay is only true when both rawStart and rawEnd are non-null.
      startAt = DateTime(rawStart.year, rawStart.month, rawStart.day);
      endAt = DateTime(rawEnd.year, rawEnd.month, rawEnd.day);
    } else {
      startAt = rawStart?.toLocal();
      endAt = rawEnd?.toLocal();
    }

    return CalendarEvent(
      id: json['id'] as String,
      title: json['title'] as String?,
      description: json['description'] as String?,
      startAt: startAt,
      endAt: endAt,
      color: json['color'] as String?,
      wsId: json['ws_id'] as String?,
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'] as String).toLocal()
          : null,
    );
  }

  final String id;
  final String? title;
  final String? description;
  final DateTime? startAt;
  final DateTime? endAt;
  final String? color;
  final String? wsId;
  final DateTime? createdAt;

  /// Whether this event is an all-day event.
  ///
  /// Computed from duration — matches the web calendar's `isAllDayEvent()`:
  /// an event is all-day if its duration is a positive multiple of 24 hours.
  /// The database has no `is_all_day` column; this is always inferred.
  bool get isAllDay {
    if (startAt == null || endAt == null) return false;
    final durationMs = endAt!.difference(startAt!).inMilliseconds;
    return durationMs > 0 && durationMs % _msPerDay == 0;
  }

  /// Duration in minutes between start and end, or 0 if either is null.
  int get durationMinutes {
    if (startAt == null || endAt == null) return 0;
    return endAt!.difference(startAt!).inMinutes;
  }

  /// Whether the event spans more than one calendar day.
  bool get isMultiDay {
    if (startAt == null || endAt == null) return false;
    final startDate = DateTime(startAt!.year, startAt!.month, startAt!.day);
    final endDate = DateTime(endAt!.year, endAt!.month, endAt!.day);
    return endDate.isAfter(startDate);
  }

  CalendarEvent copyWith({
    String? id,
    Object? title = _sentinel,
    Object? description = _sentinel,
    Object? startAt = _sentinel,
    Object? endAt = _sentinel,
    Object? color = _sentinel,
    Object? wsId = _sentinel,
    Object? createdAt = _sentinel,
  }) => CalendarEvent(
    id: id ?? this.id,
    title: title == _sentinel ? this.title : title as String?,
    description: description == _sentinel
        ? this.description
        : description as String?,
    startAt: startAt == _sentinel ? this.startAt : startAt as DateTime?,
    endAt: endAt == _sentinel ? this.endAt : endAt as DateTime?,
    color: color == _sentinel ? this.color : color as String?,
    wsId: wsId == _sentinel ? this.wsId : wsId as String?,
    createdAt: createdAt == _sentinel ? this.createdAt : createdAt as DateTime?,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'description': description,
    'start_at': startAt?.toIso8601String(),
    'end_at': endAt?.toIso8601String(),
    'color': color,
    'ws_id': wsId,
    'created_at': createdAt?.toIso8601String(),
  };

  @override
  List<Object?> get props => [
    id,
    title,
    description,
    startAt,
    endAt,
    color,
    wsId,
    createdAt,
  ];
}

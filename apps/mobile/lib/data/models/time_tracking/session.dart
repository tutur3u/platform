import 'package:equatable/equatable.dart';

class TimeTrackingSession extends Equatable {
  const TimeTrackingSession({
    required this.id,
    this.title,
    this.description,
    this.categoryId,
    this.categoryName,
    this.startAt,
    this.endAt,
    this.wsId,
    this.createdAt,
  });

  factory TimeTrackingSession.fromJson(Map<String, dynamic> json) =>
      TimeTrackingSession(
        id: json['id'] as String,
        title: json['title'] as String?,
        description: json['description'] as String?,
        categoryId: json['category_id'] as String?,
        categoryName: json['category_name'] as String?,
        startAt: json['start_at'] != null
            ? DateTime.parse(json['start_at'] as String)
            : null,
        endAt: json['end_at'] != null
            ? DateTime.parse(json['end_at'] as String)
            : null,
        wsId: json['ws_id'] as String?,
        createdAt: json['created_at'] != null
            ? DateTime.parse(json['created_at'] as String)
            : null,
      );

  final String id;
  final String? title;
  final String? description;
  final String? categoryId;
  final String? categoryName;
  final DateTime? startAt;
  final DateTime? endAt;
  final String? wsId;
  final DateTime? createdAt;

  bool get isRunning => startAt != null && endAt == null;

  Duration get duration {
    if (startAt == null) return Duration.zero;
    final end = endAt ?? DateTime.now();
    return end.difference(startAt!);
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'description': description,
        'category_id': categoryId,
        'start_at': startAt?.toIso8601String(),
        'end_at': endAt?.toIso8601String(),
        'ws_id': wsId,
        'created_at': createdAt?.toIso8601String(),
      };

  @override
  List<Object?> get props => [
        id,
        title,
        description,
        categoryId,
        categoryName,
        startAt,
        endAt,
        wsId,
      ];
}

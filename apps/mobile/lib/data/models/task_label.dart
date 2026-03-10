import 'package:equatable/equatable.dart';

class TaskLabel extends Equatable {
  const TaskLabel({
    required this.id,
    required this.wsId,
    required this.name,
    required this.color,
    this.createdAt,
    this.updatedAt,
  });

  factory TaskLabel.fromJson(Map<String, dynamic> json) {
    return TaskLabel(
      id: json['id'] as String? ?? '',
      wsId: json['ws_id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      color: json['color'] as String? ?? '',
      createdAt: _parseDate(json['created_at']),
      updatedAt: _parseDate(json['updated_at']),
    );
  }

  final String id;
  final String wsId;
  final String name;
  final String color;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  static DateTime? _parseDate(dynamic value) {
    if (value is! String || value.isEmpty) {
      return null;
    }
    return DateTime.tryParse(value)?.toLocal();
  }

  @override
  List<Object?> get props => [id, wsId, name, color, createdAt, updatedAt];
}

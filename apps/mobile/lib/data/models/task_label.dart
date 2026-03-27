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
      id: _requireNonEmptyString(json, key: 'id'),
      wsId: _requireNonEmptyString(json, key: 'ws_id'),
      name: _requireNonEmptyString(json, key: 'name'),
      color: _requireNonEmptyString(json, key: 'color'),
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

  Map<String, dynamic> toJson() => {
    'id': id,
    'ws_id': wsId,
    'name': name,
    'color': color,
    'created_at': createdAt?.toIso8601String(),
    'updated_at': updatedAt?.toIso8601String(),
  };

  static DateTime? _parseDate(dynamic value) {
    if (value is! String || value.isEmpty) {
      return null;
    }
    return DateTime.tryParse(value)?.toLocal();
  }

  static String _requireNonEmptyString(
    Map<String, dynamic> json, {
    required String key,
  }) {
    final value = json[key];
    if (value is! String || value.trim().isEmpty) {
      throw FormatException(
        'TaskLabel.fromJson: missing or empty required field "$key"',
      );
    }
    return value;
  }

  @override
  List<Object?> get props => [id, wsId, name, color, createdAt, updatedAt];
}

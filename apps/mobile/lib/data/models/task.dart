import 'package:equatable/equatable.dart';

class Task extends Equatable {
  const Task({
    required this.id,
    this.name,
    this.description,
    this.priority,
    this.completed,
    this.startDate,
    this.endDate,
    this.boardId,
    this.listId,
    this.createdAt,
  });

  factory Task.fromJson(Map<String, dynamic> json) => Task(
    id: json['id'] as String,
    name: json['name'] as String?,
    description: json['description'] as String?,
    priority: json['priority'] as int?,
    completed: json['completed'] as bool?,
    startDate: json['start_date'] != null
        ? DateTime.parse(json['start_date'] as String)
        : null,
    endDate: json['end_date'] != null
        ? DateTime.parse(json['end_date'] as String)
        : null,
    boardId: json['board_id'] as String?,
    listId: json['list_id'] as String?,
    createdAt: json['created_at'] != null
        ? DateTime.parse(json['created_at'] as String)
        : null,
  );

  final String id;
  final String? name;
  final String? description;
  final int? priority;
  final bool? completed;
  final DateTime? startDate;
  final DateTime? endDate;
  final String? boardId;
  final String? listId;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'description': description,
    'priority': priority,
    'completed': completed,
    'start_date': startDate?.toIso8601String(),
    'end_date': endDate?.toIso8601String(),
    'board_id': boardId,
    'list_id': listId,
    'created_at': createdAt?.toIso8601String(),
  };

  Task copyWith({
    String? id,
    String? name,
    String? description,
    int? priority,
    bool? completed,
    DateTime? startDate,
    DateTime? endDate,
    String? boardId,
    String? listId,
    DateTime? createdAt,
  }) => Task(
    id: id ?? this.id,
    name: name ?? this.name,
    description: description ?? this.description,
    priority: priority ?? this.priority,
    completed: completed ?? this.completed,
    startDate: startDate ?? this.startDate,
    endDate: endDate ?? this.endDate,
    boardId: boardId ?? this.boardId,
    listId: listId ?? this.listId,
    createdAt: createdAt ?? this.createdAt,
  );

  @override
  List<Object?> get props => [
    id,
    name,
    description,
    priority,
    completed,
    startDate,
    endDate,
    boardId,
    listId,
    createdAt,
  ];
}

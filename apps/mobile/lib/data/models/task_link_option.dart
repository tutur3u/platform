import 'package:equatable/equatable.dart';

class TaskLinkOption extends Equatable {
  const TaskLinkOption({
    required this.id,
    required this.name,
    this.listName,
    this.boardName,
    this.priority,
    this.completed,
    this.closedAt,
  });

  factory TaskLinkOption.fromJson(Map<String, dynamic> json) {
    return TaskLinkOption(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      listName: json['list_name'] as String?,
      boardName: json['board_name'] as String?,
      priority: json['priority'] as String?,
      completed: json['completed'] as bool?,
      closedAt: json['closed_at'] != null
          ? DateTime.tryParse(json['closed_at'] as String)
          : null,
    );
  }

  final String id;
  final String name;
  final String? listName;
  final String? boardName;
  final String? priority;
  final bool? completed;
  final DateTime? closedAt;

  @override
  List<Object?> get props => [
    id,
    name,
    listName,
    boardName,
    priority,
    completed,
    closedAt,
  ];
}

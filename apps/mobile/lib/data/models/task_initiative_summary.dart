import 'package:equatable/equatable.dart';

class TaskInitiativeLinkedProject extends Equatable {
  const TaskInitiativeLinkedProject({
    required this.id,
    required this.name,
    this.status,
  });

  factory TaskInitiativeLinkedProject.fromJson(Map<String, dynamic> json) {
    return TaskInitiativeLinkedProject(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      status: json['status'] as String?,
    );
  }

  final String id;
  final String name;
  final String? status;

  @override
  List<Object?> get props => [id, name, status];
}

class TaskInitiativeSummary extends Equatable {
  const TaskInitiativeSummary({
    required this.id,
    required this.name,
    required this.createdAt,
    required this.projectsCount,
    required this.linkedProjects,
    this.description,
    this.status,
  });

  factory TaskInitiativeSummary.fromJson(Map<String, dynamic> json) {
    return TaskInitiativeSummary(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      description: json['description'] as String?,
      status: json['status'] as String?,
      createdAt:
          DateTime.tryParse(json['created_at'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      projectsCount: (json['projectsCount'] as num?)?.toInt() ?? 0,
      linkedProjects: ((json['linkedProjects'] as List<dynamic>?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(TaskInitiativeLinkedProject.fromJson)
          .toList(growable: false),
    );
  }

  final String id;
  final String name;
  final String? description;
  final String? status;
  final DateTime createdAt;
  final int projectsCount;
  final List<TaskInitiativeLinkedProject> linkedProjects;

  @override
  List<Object?> get props => [
    id,
    name,
    description,
    status,
    createdAt,
    projectsCount,
    linkedProjects,
  ];
}

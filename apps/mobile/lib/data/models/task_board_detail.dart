import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace_user_option.dart';

class TaskBoardDetail extends Equatable {
  const TaskBoardDetail({
    required this.id,
    required this.wsId,
    this.name,
    this.icon,
    this.ticketPrefix,
    this.createdAt,
    this.archivedAt,
    this.deletedAt,
    this.estimationType,
    this.extendedEstimation = false,
    this.allowZeroEstimates = true,
    this.countUnestimatedIssues = false,
    this.lists = const [],
    this.tasks = const [],
    this.labels = const [],
    this.members = const [],
    this.projects = const [],
  });

  factory TaskBoardDetail.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    if (rawId is! String || rawId.trim().isEmpty) {
      throw const FormatException(
        'TaskBoardDetail.fromJson: required field "id" is missing or invalid',
      );
    }

    final rawWorkspaceId = json['ws_id'];
    if (rawWorkspaceId is! String || rawWorkspaceId.trim().isEmpty) {
      throw const FormatException(
        'TaskBoardDetail.fromJson: required field "ws_id" '
        'is missing or invalid',
      );
    }

    return TaskBoardDetail(
      id: rawId.trim(),
      wsId: rawWorkspaceId.trim(),
      name: (json['name'] as String?)?.trim(),
      icon: (json['icon'] as String?)?.trim(),
      ticketPrefix: (json['ticket_prefix'] as String?)?.trim(),
      createdAt: _parseDateTime(json['created_at']),
      archivedAt: _parseDateTime(json['archived_at']),
      deletedAt: _parseDateTime(json['deleted_at']),
      estimationType: (json['estimation_type'] as String?)?.trim(),
      extendedEstimation: json['extended_estimation'] as bool? ?? false,
      allowZeroEstimates: json['allow_zero_estimates'] as bool? ?? true,
      countUnestimatedIssues:
          json['count_unestimated_issues'] as bool? ?? false,
    );
  }

  static DateTime? _parseDateTime(Object? value) {
    if (value is! String || value.isEmpty) return null;
    return DateTime.tryParse(value)?.toLocal();
  }

  final String id;
  final String wsId;
  final String? name;
  final String? icon;
  final String? ticketPrefix;
  final DateTime? createdAt;
  final DateTime? archivedAt;
  final DateTime? deletedAt;
  final String? estimationType;
  final bool extendedEstimation;
  final bool allowZeroEstimates;
  final bool countUnestimatedIssues;
  final List<TaskBoardList> lists;
  final List<TaskBoardTask> tasks;
  final List<TaskLabel> labels;
  final List<WorkspaceUserOption> members;
  final List<TaskProjectSummary> projects;

  TaskBoardDetail copyWith({
    String? name,
    String? icon,
    String? ticketPrefix,
    DateTime? createdAt,
    DateTime? archivedAt,
    DateTime? deletedAt,
    String? estimationType,
    bool? extendedEstimation,
    bool? allowZeroEstimates,
    bool? countUnestimatedIssues,
    List<TaskBoardList>? lists,
    List<TaskBoardTask>? tasks,
    List<TaskLabel>? labels,
    List<WorkspaceUserOption>? members,
    List<TaskProjectSummary>? projects,
  }) {
    return TaskBoardDetail(
      id: id,
      wsId: wsId,
      name: name ?? this.name,
      icon: icon ?? this.icon,
      ticketPrefix: ticketPrefix ?? this.ticketPrefix,
      createdAt: createdAt ?? this.createdAt,
      archivedAt: archivedAt ?? this.archivedAt,
      deletedAt: deletedAt ?? this.deletedAt,
      estimationType: estimationType ?? this.estimationType,
      extendedEstimation: extendedEstimation ?? this.extendedEstimation,
      allowZeroEstimates: allowZeroEstimates ?? this.allowZeroEstimates,
      countUnestimatedIssues:
          countUnestimatedIssues ?? this.countUnestimatedIssues,
      lists: lists ?? this.lists,
      tasks: tasks ?? this.tasks,
      labels: labels ?? this.labels,
      members: members ?? this.members,
      projects: projects ?? this.projects,
    );
  }

  @override
  List<Object?> get props => [
    id,
    wsId,
    name,
    icon,
    ticketPrefix,
    createdAt,
    archivedAt,
    deletedAt,
    estimationType,
    extendedEstimation,
    allowZeroEstimates,
    countUnestimatedIssues,
    lists,
    tasks,
    labels,
    members,
    projects,
  ];
}

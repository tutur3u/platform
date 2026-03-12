import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/utils/date_utils.dart';

const _taskBoardDetailSentinel = Object();

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
      createdAt: parseDateTime(json['created_at']),
      archivedAt: parseDateTime(json['archived_at']),
      deletedAt: parseDateTime(json['deleted_at']),
      estimationType: (json['estimation_type'] as String?)?.trim(),
      extendedEstimation: json['extended_estimation'] as bool? ?? false,
      allowZeroEstimates: json['allow_zero_estimates'] as bool? ?? true,
      countUnestimatedIssues:
          json['count_unestimated_issues'] as bool? ?? false,
    );
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
    Object? name = _taskBoardDetailSentinel,
    Object? icon = _taskBoardDetailSentinel,
    Object? ticketPrefix = _taskBoardDetailSentinel,
    Object? createdAt = _taskBoardDetailSentinel,
    Object? archivedAt = _taskBoardDetailSentinel,
    Object? deletedAt = _taskBoardDetailSentinel,
    Object? estimationType = _taskBoardDetailSentinel,
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
      name: name == _taskBoardDetailSentinel ? this.name : name as String?,
      icon: icon == _taskBoardDetailSentinel ? this.icon : icon as String?,
      ticketPrefix: ticketPrefix == _taskBoardDetailSentinel
          ? this.ticketPrefix
          : ticketPrefix as String?,
      createdAt: createdAt == _taskBoardDetailSentinel
          ? this.createdAt
          : createdAt as DateTime?,
      archivedAt: archivedAt == _taskBoardDetailSentinel
          ? this.archivedAt
          : archivedAt as DateTime?,
      deletedAt: deletedAt == _taskBoardDetailSentinel
          ? this.deletedAt
          : deletedAt as DateTime?,
      estimationType: estimationType == _taskBoardDetailSentinel
          ? this.estimationType
          : estimationType as String?,
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

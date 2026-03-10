import 'package:equatable/equatable.dart';

const _sentinel = Object();

class TaskEstimateBoard extends Equatable {
  const TaskEstimateBoard({
    required this.id,
    required this.createdAt,
    this.name,
    this.estimationType,
    this.extendedEstimation = false,
    this.allowZeroEstimates = true,
    this.countUnestimatedIssues = false,
  });

  factory TaskEstimateBoard.fromJson(Map<String, dynamic> json) {
    return TaskEstimateBoard(
      id: json['id'] as String,
      name: (json['name'] as String?)?.trim().isNotEmpty == true
          ? (json['name'] as String).trim()
          : null,
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'] as String)
          : null,
      estimationType: json['estimation_type'] as String?,
      extendedEstimation: json['extended_estimation'] as bool? ?? false,
      allowZeroEstimates: json['allow_zero_estimates'] as bool? ?? true,
      countUnestimatedIssues:
          json['count_unestimated_issues'] as bool? ?? false,
    );
  }

  final String id;
  final String? name;
  final DateTime? createdAt;
  final String? estimationType;
  final bool extendedEstimation;
  final bool allowZeroEstimates;
  final bool countUnestimatedIssues;

  TaskEstimateBoard copyWith({
    String? id,
    Object? name = _sentinel,
    Object? createdAt = _sentinel,
    Object? estimationType = _sentinel,
    bool? extendedEstimation,
    bool? allowZeroEstimates,
    bool? countUnestimatedIssues,
  }) {
    return TaskEstimateBoard(
      id: id ?? this.id,
      name: name == _sentinel ? this.name : name as String?,
      createdAt: createdAt == _sentinel
          ? this.createdAt
          : createdAt as DateTime?,
      estimationType: estimationType == _sentinel
          ? this.estimationType
          : estimationType as String?,
      extendedEstimation: extendedEstimation ?? this.extendedEstimation,
      allowZeroEstimates: allowZeroEstimates ?? this.allowZeroEstimates,
      countUnestimatedIssues:
          countUnestimatedIssues ?? this.countUnestimatedIssues,
    );
  }

  @override
  List<Object?> get props => [
    id,
    name,
    createdAt,
    estimationType,
    extendedEstimation,
    allowZeroEstimates,
    countUnestimatedIssues,
  ];
}

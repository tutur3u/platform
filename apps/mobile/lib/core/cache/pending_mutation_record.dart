import 'package:mobile/core/cache/offline_resource_reference.dart';

class PendingMutationRecord {
  const PendingMutationRecord({
    required this.id,
    required this.feature,
    required this.method,
    required this.path,
    required this.createdAt,
    this.userId,
    this.workspaceId,
    this.payload,
    this.optimisticPatch,
    this.attemptCount = 0,
    this.lastError,
    this.status = PendingMutationStatus.queued,
    this.replaySafe = false,
    this.requiredReferences = const {},
    this.acknowledgedServerId,
    this.acknowledgedData,
    this.acknowledgedWrite = false,
    this.acknowledgedDeletedId,
    this.dependencyIssue,
  });

  factory PendingMutationRecord.fromJson(Map<dynamic, dynamic> json) {
    return PendingMutationRecord(
      id: json['id'] as String,
      feature: json['feature'] as String,
      method: json['method'] as String,
      path: json['path'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      userId: json['userId'] as String?,
      workspaceId: json['workspaceId'] as String?,
      payload: (json['payload'] as Map<dynamic, dynamic>?)?.map(
        (key, value) => MapEntry(key.toString(), value),
      ),
      optimisticPatch: (json['optimisticPatch'] as Map<dynamic, dynamic>?)?.map(
        (key, value) => MapEntry(key.toString(), value),
      ),
      attemptCount: (json['attemptCount'] as num?)?.toInt() ?? 0,
      lastError: json['lastError'] as String?,
      status: PendingMutationStatus.values.firstWhere(
        (value) => value.name == json['status'],
        orElse: () => PendingMutationStatus.queued,
      ),
      replaySafe: json['replaySafe'] == true,
      requiredReferences: (json['requiredReferences'] as List<dynamic>? ?? [])
          .map((value) => OfflineResourceReference.fromJson(value as Map))
          .toSet(),
      acknowledgedServerId: json['acknowledgedServerId'] as String?,
      acknowledgedData: (json['acknowledgedData'] as Map?)?.map(
        (key, value) => MapEntry(key.toString(), value),
      ),
      acknowledgedDeletedId: json['acknowledgedDeletedId'] as String?,
      acknowledgedWrite: json['acknowledgedWrite'] == true,
      dependencyIssue: OfflineDependencyIssue.values
          .where((value) => value.name == json['dependencyIssue'])
          .firstOrNull,
    );
  }

  final String id;
  final String feature;
  final String method;
  final String path;
  final DateTime createdAt;
  final String? userId;
  final String? workspaceId;
  final Map<String, dynamic>? payload;
  final Map<String, dynamic>? optimisticPatch;
  final int attemptCount;
  final String? lastError;
  final PendingMutationStatus status;

  /// True only when the server deduplicates this operation identity on retry.
  final bool replaySafe;

  /// Durable known-local references survive prerequisite cancellation/restart.
  final Set<OfflineResourceReference> requiredReferences;

  /// Observed server acknowledgment is persisted before publishing the mapping.
  /// Recovery completes local publication without sending the create again.
  final String? acknowledgedServerId;
  final Map<String, dynamic>? acknowledgedData;
  final bool acknowledgedWrite;
  final String? acknowledgedDeletedId;
  final OfflineDependencyIssue? dependencyIssue;

  bool get canRetry =>
      method != 'INVALID' &&
      dependencyIssue != OfflineDependencyIssue.invalidPayload;

  String? get entityId => optimisticPatch?['entityId'] as String?;

  PendingMutationRecord copyWith({
    int? attemptCount,
    String? lastError,
    PendingMutationStatus? status,
    Set<OfflineResourceReference>? requiredReferences,
    String? acknowledgedServerId,
    Map<String, dynamic>? acknowledgedData,
    bool? acknowledgedWrite,
    String? acknowledgedDeletedId,
    OfflineDependencyIssue? dependencyIssue,
    bool clearDependencyIssue = false,
  }) {
    return PendingMutationRecord(
      id: id,
      feature: feature,
      method: method,
      path: path,
      createdAt: createdAt,
      userId: userId,
      workspaceId: workspaceId,
      payload: payload,
      optimisticPatch: optimisticPatch,
      attemptCount: attemptCount ?? this.attemptCount,
      lastError: lastError ?? this.lastError,
      status: status ?? this.status,
      replaySafe: replaySafe,
      requiredReferences: requiredReferences ?? this.requiredReferences,
      acknowledgedServerId: acknowledgedServerId ?? this.acknowledgedServerId,
      acknowledgedData: acknowledgedData ?? this.acknowledgedData,
      acknowledgedWrite: acknowledgedWrite ?? this.acknowledgedWrite,
      acknowledgedDeletedId:
          acknowledgedDeletedId ?? this.acknowledgedDeletedId,
      dependencyIssue: clearDependencyIssue
          ? null
          : dependencyIssue ?? this.dependencyIssue,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'feature': feature,
    'method': method,
    'path': path,
    'createdAt': createdAt.toIso8601String(),
    'userId': userId,
    'workspaceId': workspaceId,
    'payload': payload,
    'optimisticPatch': optimisticPatch,
    'attemptCount': attemptCount,
    'lastError': lastError,
    'status': status.name,
    'replaySafe': replaySafe,
    'requiredReferences': requiredReferences
        .map((ref) => ref.toJson())
        .toList(),
    'acknowledgedServerId': acknowledgedServerId,
    'acknowledgedData': acknowledgedData,
    'acknowledgedWrite': acknowledgedWrite,
    'acknowledgedDeletedId': acknowledgedDeletedId,
    'dependencyIssue': dependencyIssue?.name,
  };
}

enum PendingMutationStatus { queued, conflict, failed }

/// Safe diagnostics never contain payloads, raw identifiers or credentials.
enum OfflineDependencyIssue {
  invalidPayload,
  waiting,
  missing,
  cycle,
  ambiguous,
  contractUnavailable,
}

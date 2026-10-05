import 'package:mobile/core/cache/pending_mutation_record.dart';

/// A queryable, account-scoped row materialized from an API snapshot.
class ReplicaEntityRecord {
  const ReplicaEntityRecord({
    required this.id,
    required this.namespace,
    required this.sourceKey,
    required this.payload,
    required this.fetchedAt,
    this.userId,
    this.workspaceId,
    this.pendingStatus,
    this.mergeSources = const [],
  });

  factory ReplicaEntityRecord.fromJson(Map<dynamic, dynamic> json) =>
      ReplicaEntityRecord(
        id: json['id'] as String,
        namespace: json['namespace'] as String,
        sourceKey: json['sourceKey'] as String,
        payload: Map<String, dynamic>.from(json['payload'] as Map),
        fetchedAt: DateTime.parse(json['fetchedAt'] as String),
        userId: json['userId'] as String?,
        workspaceId: json['workspaceId'] as String?,
      );

  final String id;
  final String namespace;
  final String sourceKey;
  final Map<String, dynamic> payload;
  final DateTime fetchedAt;
  final String? userId;
  final String? workspaceId;
  final PendingMutationStatus? pendingStatus;

  /// Original query sources for field precedence; never persisted.
  /// Rebuilding after removal cannot retain that source's fields.
  final List<ReplicaEntityRecord> mergeSources;

  ReplicaEntityRecord copyWith({
    Map<String, dynamic>? payload,
    PendingMutationStatus? pendingStatus,
  }) => ReplicaEntityRecord(
    id: id,
    namespace: namespace,
    sourceKey: sourceKey,
    payload: payload ?? this.payload,
    fetchedAt: fetchedAt,
    userId: userId,
    workspaceId: workspaceId,
    pendingStatus: pendingStatus ?? this.pendingStatus,
    mergeSources: mergeSources,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'namespace': namespace,
    'sourceKey': sourceKey,
    'payload': payload,
    'fetchedAt': fetchedAt.toIso8601String(),
    'userId': userId,
    'workspaceId': workspaceId,
  };
}

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

  PendingMutationRecord copyWith({
    int? attemptCount,
    String? lastError,
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
  };
}

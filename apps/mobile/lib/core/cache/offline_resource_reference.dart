import 'package:flutter/foundation.dart';

/// A local entity reference belongs to one account, workspace and resource.
/// Resource identity separates same-valued IDs from unrelated setup tables.
@immutable
class OfflineResourceReference {
  const OfflineResourceReference({
    required this.userId,
    required this.workspaceId,
    required this.feature,
    required this.resource,
    required this.localId,
  });

  factory OfflineResourceReference.fromJson(Map<dynamic, dynamic> json) =>
      OfflineResourceReference(
        userId: json['userId'] as String,
        workspaceId: json['workspaceId'] as String,
        feature: json['feature'] as String,
        resource: json['resource'] as String,
        localId: json['localId'] as String,
      );

  final String userId;
  final String workspaceId;
  final String feature;
  final String resource;
  final String localId;

  String get mappingNamespace => '$feature:$resource';

  Map<String, String> toJson() => {
    'userId': userId,
    'workspaceId': workspaceId,
    'feature': feature,
    'resource': resource,
    'localId': localId,
  };

  @override
  bool operator ==(Object other) =>
      other is OfflineResourceReference &&
      userId == other.userId &&
      workspaceId == other.workspaceId &&
      feature == other.feature &&
      resource == other.resource &&
      localId == other.localId;

  @override
  int get hashCode =>
      Object.hash(userId, workspaceId, feature, resource, localId);
}

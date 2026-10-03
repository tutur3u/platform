import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_inventory_mutation.dart';
import 'package:mobile/core/cache/offline_resource_reference.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/sources/api_client.dart';

/// The mapping is an independent durable publication. A server acknowledgment
/// survives process death or storage failure before mapping/dequeue completes.
class OfflineInventoryPersistence {
  const OfflineInventoryPersistence(this.store);
  final CacheStore store;

  Future<Map<OfflineResourceReference, String>> mappings(
    Iterable<OfflineResourceReference> references,
  ) async {
    final result = <OfflineResourceReference, String>{};
    final cache = <(String, String, String), Map<String, String>>{};
    for (final reference in references) {
      final key = (
        reference.userId,
        reference.workspaceId,
        reference.mappingNamespace,
      );
      final ids = cache[key] ??= await store.localIdMappings(
        userId: reference.userId,
        workspaceId: reference.workspaceId,
        feature: reference.mappingNamespace,
      );
      final id = ids[reference.localId];
      if (id != null) result[reference] = id;
    }
    return result;
  }

  Future<PendingMutationRecord> acknowledge(
    PendingMutationRecord record,
    String serverId, {
    Map<String, dynamic>? data,
  }) async {
    if (record.acknowledgedServerId != null &&
        record.acknowledgedServerId != serverId) {
      throw StateError('Offline acknowledgment identity changed');
    }
    final acknowledged = await store.updatePendingMutation(record.id, (
      current,
    ) {
      if (current.acknowledgedServerId != null &&
          current.acknowledgedServerId != serverId) {
        throw StateError('Offline acknowledgment identity changed');
      }
      return current.copyWith(
        acknowledgedServerId: serverId,
        acknowledgedData: data,
        clearDependencyIssue: true,
      );
    });
    if (acknowledged == null) {
      throw StateError('Offline create record was removed');
    }
    return acknowledged;
  }

  Future<void> publishAcknowledgment(PendingMutationRecord record) async {
    final reference = OfflineInventoryMutation.fromRecord(
      record,
    )?.node.produces;
    final serverId = record.acknowledgedServerId;
    if (reference == null || serverId == null) {
      throw StateError('Offline create acknowledgment is incomplete');
    }
    final deleted = await store.deletedOfflineResources(
      userId: reference.userId,
      workspaceId: reference.workspaceId,
    );
    final serverReference = OfflineResourceReference(
      userId: reference.userId,
      workspaceId: reference.workspaceId,
      feature: reference.feature,
      resource: reference.resource,
      localId: serverId,
    );
    if (deleted.contains(reference) || deleted.contains(serverReference)) {
      throw const ApiException(
        message: 'Offline resource was deleted',
        statusCode: 409,
        code: 'OFFLINE_RESOURCE_DELETED',
      );
    }
    final previous = (await mappings([reference]))[reference];
    if (previous != null && previous != serverId) {
      throw const ApiException(
        message: 'Offline resource mapping identity changed',
        statusCode: 409,
        code: 'OFFLINE_MAPPING_CONFLICT',
      );
    }
    await store.saveLocalIdMapping(
      userId: reference.userId,
      workspaceId: reference.workspaceId,
      feature: reference.mappingNamespace,
      localId: reference.localId,
      serverId: serverId,
      resourceData: record.acknowledgedData,
    );
  }

  Future<PendingMutationRecord> acknowledgeDeletion(
    PendingMutationRecord record,
    String serverId,
  ) async {
    final acknowledged = await store.updatePendingMutation(
      record.id,
      (current) => current.copyWith(acknowledgedDeletedId: serverId),
    );
    if (acknowledged == null) {
      throw StateError('Offline deletion record was removed');
    }
    return acknowledged;
  }

  Future<void> publishDeletion(PendingMutationRecord record) async {
    final reference = OfflineInventoryMutation.fromRecord(record)?.identity;
    if (reference == null || record.acknowledgedDeletedId == null) {
      throw StateError('Offline deletion acknowledgment is incomplete');
    }
    await store.tombstoneOfflineResource(
      reference,
      record.acknowledgedDeletedId!,
    );
  }
}

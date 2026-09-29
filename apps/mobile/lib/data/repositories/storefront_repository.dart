import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/storefront/storefront_models.dart';
import 'package:mobile/data/sources/api_client.dart';

class StorefrontRepository {
  StorefrontRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  Future<({List<Storefront> data, int count})> listStorefronts(
    String wsId, {
    String status = 'all',
    String? query,
  }) async {
    final response = await readThroughJson(
      api: _api,
      namespace: 'storefront.list',
      workspaceId: wsId,
      path: StorefrontEndpoints.storefronts(wsId, status: status, query: query),
    );
    final rows = (response['data'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(Map<String, dynamic>.from)
        .toList();
    for (final item in await OfflineMutationQueue.instance.listPending()) {
      if (item.feature != 'storefront' || item.workspaceId != wsId) continue;
      final id = item.entityId;
      if (id == null || item.path.contains('/listings')) continue;
      if (item.method == 'POST' && item.path.contains('/storefronts?')) {
        rows.insert(0, {...?item.payload, 'id': id});
      } else if (item.method == 'PATCH') {
        final index = rows.indexWhere((row) => row['id'] == id);
        if (index >= 0) rows[index].addAll(item.payload ?? const {});
      }
    }
    final storefronts = rows
        .map(Storefront.fromJson)
        .where((storefront) {
          if (status != 'all' && storefront.status != status) return false;
          if (query != null && query.trim().isNotEmpty) {
            return storefront.name.toLowerCase().contains(query.toLowerCase());
          }
          return true;
        })
        .toList(growable: false);
    return (
      data: storefronts,
      count: (response['count'] as num?)?.toInt() ?? storefronts.length,
    );
  }

  Future<Storefront> getStorefront(String wsId, String storefrontId) async {
    final pending = (await OfflineMutationQueue.instance.listPending())
        .where(
          (item) => item.feature == 'storefront' && item.workspaceId == wsId,
        )
        .toList();
    final created = pending
        .where(
          (item) =>
              item.method == 'POST' &&
              !item.path.contains('/listings') &&
              item.entityId == storefrontId,
        )
        .firstOrNull;
    if (created != null) {
      final row = <String, dynamic>{...?created.payload, 'id': storefrontId};
      for (final item in pending) {
        if (item.entityId == storefrontId && item.method == 'PATCH') {
          row.addAll(item.payload ?? const {});
        }
      }
      return Storefront.fromJson(row);
    }
    final response = await readThroughJson(
      api: _api,
      namespace: 'storefront.detail',
      workspaceId: wsId,
      path: StorefrontEndpoints.storefront(wsId, storefrontId),
    );
    final row = Map<String, dynamic>.from(response['data'] as Map);
    for (final item in pending) {
      if (item.entityId == storefrontId && item.method == 'PATCH') {
        row.addAll(item.payload ?? const {});
      }
    }
    return Storefront.fromJson(row);
  }

  Future<Storefront> createStorefront(
    String wsId,
    Map<String, dynamic> payload,
  ) async {
    final path = StorefrontEndpoints.storefronts(wsId);
    return await queueOrSendValue<Storefront>(
      feature: 'storefront',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      pendingValue: (id) => Storefront.fromJson({...payload, 'id': id}),
      send: () async {
        final response = await _api.postJson(path, payload);
        return Storefront.fromJson(
          Map<String, dynamic>.from(response['data'] as Map),
        );
      },
    );
  }

  Future<Storefront> updateStorefront(
    String wsId,
    String storefrontId,
    Map<String, dynamic> payload,
  ) async {
    final path = StorefrontEndpoints.storefront(wsId, storefrontId);
    return await queueOrSendValue<Storefront>(
      feature: 'storefront',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: storefrontId,
      payload: payload,
      pendingValue: (id) => Storefront.fromJson({...payload, 'id': id}),
      send: () async {
        final response = await _api.patchJson(path, payload);
        return Storefront.fromJson(
          Map<String, dynamic>.from(response['data'] as Map),
        );
      },
    );
  }

  Future<void> deleteStorefront(String wsId, String storefrontId) async {
    final path = StorefrontEndpoints.storefront(wsId, storefrontId);
    await queueOrSendVoid(
      feature: 'storefront',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: storefrontId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
  }

  Future<List<StorefrontListing>> listListings(
    String wsId,
    String storefrontId,
  ) async {
    final pending = await OfflineMutationQueue.instance.listPending();
    final localParent = pending.any(
      (item) =>
          item.feature == 'storefront' &&
          item.method == 'POST' &&
          !item.path.contains('/listings') &&
          item.entityId == storefrontId,
    );
    final response = localParent
        ? <String, dynamic>{'data': <dynamic>[]}
        : await readThroughJson(
            api: _api,
            namespace: 'storefront.listings',
            workspaceId: wsId,
            path: StorefrontEndpoints.listings(wsId, storefrontId),
          );
    final rows = (response['data'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(Map<String, dynamic>.from)
        .toList();
    for (final item in pending) {
      if (item.feature != 'storefront' ||
          item.workspaceId != wsId ||
          !item.path.contains('/$storefrontId/listings')) {
        continue;
      }
      final id = item.entityId;
      if (id == null) continue;
      if (item.method == 'POST') {
        rows.add({...?item.payload, 'id': id, 'storefrontId': storefrontId});
      } else if (item.method == 'PATCH') {
        final index = rows.indexWhere((row) => row['id'] == id);
        if (index >= 0) rows[index].addAll(item.payload ?? const {});
      }
    }
    return rows.map(StorefrontListing.fromJson).toList(growable: false);
  }

  Future<StorefrontListing> createListing(
    String wsId,
    String storefrontId,
    Map<String, dynamic> payload,
  ) async {
    final path = StorefrontEndpoints.listings(wsId, storefrontId);
    return await queueOrSendValue<StorefrontListing>(
      feature: 'storefront',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      pendingValue: (id) => StorefrontListing.fromJson({
        ...payload,
        'id': id,
        'storefrontId': storefrontId,
      }),
      send: () async {
        final response = await _api.postJson(path, payload);
        return StorefrontListing.fromJson(
          Map<String, dynamic>.from(response['data'] as Map),
        );
      },
    );
  }

  Future<StorefrontListing> updateListing(
    String wsId,
    String storefrontId,
    String listingId,
    Map<String, dynamic> payload,
  ) async {
    final path = StorefrontEndpoints.listing(wsId, storefrontId, listingId);
    return await queueOrSendValue<StorefrontListing>(
      feature: 'storefront',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: listingId,
      payload: payload,
      pendingValue: (id) => StorefrontListing.fromJson({
        ...payload,
        'id': id,
        'storefrontId': storefrontId,
      }),
      send: () async {
        final response = await _api.patchJson(path, payload);
        return StorefrontListing.fromJson(
          Map<String, dynamic>.from(response['data'] as Map),
        );
      },
    );
  }

  Future<void> deleteListing(
    String wsId,
    String storefrontId,
    String listingId,
  ) async {
    final path = StorefrontEndpoints.listing(wsId, storefrontId, listingId);
    await queueOrSendVoid(
      feature: 'storefront',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: listingId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
  }

  void dispose() => _api.dispose();
}

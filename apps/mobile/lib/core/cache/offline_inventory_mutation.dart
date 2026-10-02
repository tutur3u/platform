import 'dart:convert';

import 'package:mobile/core/cache/offline_dependency_graph.dart';
import 'package:mobile/core/cache/offline_resource_reference.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';

/// Inventory references are declared by field and resource, never inferred from
/// arbitrary strings. Finance categories/wallets retain their own namespace.
class OfflineInventoryMutation {
  OfflineInventoryMutation._(this.record, this.resource, this._segments);

  static OfflineInventoryMutation? fromRecord(PendingMutationRecord record) {
    if (record.userId == null ||
        record.workspaceId == null ||
        !{'inventory', 'finance'}.contains(record.feature)) {
      return null;
    }
    final parts = Uri.parse(record.path).pathSegments;
    final at = parts.indexOf('workspaces');
    if (at < 0 ||
        parts.length <= at + 2 ||
        parts[at + 1] != record.workspaceId) {
      return null;
    }
    final tail = parts.skip(at + 2).toList();
    String? resource;
    switch (tail.first) {
      case 'product-categories':
        resource = 'category';
      case 'product-units':
        resource = 'unit';
      case 'product-warehouses':
        resource = 'warehouse';
      case 'products':
        resource = 'product';
      case 'inventory':
        if (tail.length < 2) return null;
        resource = switch (tail[1]) {
          'owners' => 'owner',
          'manufacturers' => 'manufacturer',
          'sales-periods' => 'period',
          'sales' => 'sale',
          _ => null,
        };
      case 'finance':
        if (tail.length > 1 && tail[1] == 'invoices') resource = 'sale';
      case 'transactions':
        if (tail.length > 1 && tail[1] == 'categories') {
          resource = 'finance_category';
        }
      case 'wallets':
        resource = 'wallet';
    }
    if (resource == null) return null;
    // Mutations such as product bundles use separate, unsupported contracts.
    final collectionLength =
        {
              'owner',
              'manufacturer',
              'period',
              'sale',
              'finance_category',
            }.contains(resource) &&
            tail.first != 'wallets'
        ? 2
        : 1;
    if (tail.length > collectionLength + 1 &&
        !(resource == 'period' && tail.last == 'prices') &&
        !(resource == 'sale' && tail.last == 'period')) {
      return null;
    }
    return OfflineInventoryMutation._(record, resource, parts);
  }

  final PendingMutationRecord record;
  final String resource;
  final List<String> _segments;

  String get _feature => {'finance_category', 'wallet'}.contains(resource)
      ? 'finance'
      : 'inventory';
  String get _mappingResource =>
      resource == 'finance_category' ? 'category' : resource;

  OfflineResourceReference _reference(String kind, String id) =>
      OfflineResourceReference(
        userId: record.userId!,
        workspaceId: record.workspaceId!,
        feature: {'finance_category', 'wallet'}.contains(kind)
            ? 'finance'
            : 'inventory',
        resource: kind == 'finance_category' ? 'category' : kind,
        localId: id,
      );

  bool get isCreate {
    if (record.method.toUpperCase() != 'POST' || record.entityId == null) {
      return false;
    }
    final tail = _segments.skip(_segments.indexOf('workspaces') + 2).toList();
    final length =
        tail.first == 'inventory' ||
            tail.first == 'finance' ||
            tail.first == 'transactions'
        ? 2
        : 1;
    return tail.length == length;
  }

  /// Only these new create routes carry the explicit deduplicated SQL contract.
  bool get usesCreateContract =>
      isCreate && !{'sale', 'wallet'}.contains(resource);

  OfflineResourceReference? get identity {
    final tail = _segments.skip(_segments.indexOf('workspaces') + 2).toList();
    final length =
        tail.first == 'inventory' ||
            tail.first == 'finance' ||
            tail.first == 'transactions'
        ? 2
        : 1;
    final localId = isCreate
        ? record.entityId
        : tail.length > length
        ? tail[length]
        : null;
    if (localId == null) return null;
    return OfflineResourceReference(
      userId: record.userId!,
      workspaceId: record.workspaceId!,
      feature: _feature,
      resource: _mappingResource,
      localId: localId,
    );
  }

  Set<OfflineResourceReference> get references {
    final result = <OfflineResourceReference>{};
    void field(Map<dynamic, dynamic> value, String key, String kind) {
      final id = value[key];
      if (id is String && id.isNotEmpty) result.add(_reference(kind, id));
    }

    final payload = record.payload ?? const <String, dynamic>{};
    if (!isCreate && identity != null) result.add(identity!);
    if (resource == 'product') {
      field(payload, 'category_id', 'category');
      field(payload, 'owner_id', 'owner');
      field(payload, 'manufacturer_id', 'manufacturer');
      field(payload, 'finance_category_id', 'finance_category');
      for (final row in (payload['inventory'] as List<dynamic>? ?? [])) {
        if (row is! Map) continue;
        field(row, 'unit_id', 'unit');
        field(row, 'warehouse_id', 'warehouse');
        field(row, 'revenue_share_partner_id', 'owner');
      }
    }
    if (resource == 'period') {
      for (final id in (payload['product_ids'] as List<dynamic>? ?? [])) {
        if (id is String) result.add(_reference('product', id));
      }
      for (final row in (payload['prices'] as List<dynamic>? ?? [])) {
        if (row is! Map) continue;
        field(row, 'product_id', 'product');
        field(row, 'unit_id', 'unit');
        field(row, 'warehouse_id', 'warehouse');
      }
    }
    if (resource == 'sale') {
      field(payload, 'wallet_id', 'wallet');
      field(payload, 'category_id', 'finance_category');
      field(payload, 'inventory_period_id', 'period');
      field(payload, 'period_id', 'period');
      for (final row in (payload['products'] as List<dynamic>? ?? [])) {
        if (row is! Map) continue;
        field(row, 'product_id', 'product');
        field(row, 'unit_id', 'unit');
        field(row, 'warehouse_id', 'warehouse');
      }
    }
    // payload.id describes the creator itself and is never a dependency.
    return result;
  }

  OfflineDependencyNode get node => OfflineDependencyNode(
    record: record,
    produces: isCreate ? identity : null,
    serialIdentity: identity,
    references: references,
    requiredReferences: record.requiredReferences,
  );

  ({String path, Map<String, dynamic>? payload}) resolve(
    Map<OfflineResourceReference, String> mappings,
  ) {
    final payload = record.payload == null
        ? null
        : jsonDecode(jsonEncode(record.payload)) as Map<String, dynamic>;
    void field(Map<dynamic, dynamic> value, String key, String kind) {
      final id = value[key];
      if (id is String) {
        final mapped = mappings[_reference(kind, id)];
        if (mapped != null) value[key] = mapped;
      }
    }

    if (payload != null) {
      if (resource == 'product') {
        field(payload, 'category_id', 'category');
        field(payload, 'owner_id', 'owner');
        field(payload, 'manufacturer_id', 'manufacturer');
        field(payload, 'finance_category_id', 'finance_category');
        for (final row in (payload['inventory'] as List<dynamic>? ?? [])) {
          if (row is! Map) continue;
          field(row, 'unit_id', 'unit');
          field(row, 'warehouse_id', 'warehouse');
          field(row, 'revenue_share_partner_id', 'owner');
        }
      }
      if (resource == 'period') {
        if (payload['product_ids'] is List) {
          payload['product_ids'] = (payload['product_ids'] as List)
              .map(
                (id) => id is String
                    ? mappings[_reference('product', id)] ?? id
                    : id,
              )
              .toList();
        }
        for (final row in (payload['prices'] as List<dynamic>? ?? [])) {
          if (row is! Map) continue;
          field(row, 'product_id', 'product');
          field(row, 'unit_id', 'unit');
          field(row, 'warehouse_id', 'warehouse');
        }
      }
      if (resource == 'sale') {
        field(payload, 'wallet_id', 'wallet');
        field(payload, 'category_id', 'finance_category');
        field(payload, 'inventory_period_id', 'period');
        field(payload, 'period_id', 'period');
        for (final row in (payload['products'] as List<dynamic>? ?? [])) {
          if (row is! Map) continue;
          field(row, 'product_id', 'product');
          field(row, 'unit_id', 'unit');
          field(row, 'warehouse_id', 'warehouse');
        }
      }
    }
    var path = record.path;
    if (!isCreate && identity != null && mappings[identity] != null) {
      final uri = Uri.parse(path);
      final entityIndex =
          _segments.indexOf('workspaces') +
          2 +
          (_segments[_segments.indexOf('workspaces') + 2] == 'inventory' ||
                  _segments[_segments.indexOf('workspaces') + 2] == 'finance' ||
                  _segments[_segments.indexOf('workspaces') + 2] ==
                      'transactions'
              ? 2
              : 1);
      final segments = [...uri.pathSegments];
      segments[entityIndex] = mappings[identity]!;
      path = uri
          .replace(
            path: Uri(
              pathSegments: [if (uri.path.startsWith('/')) '', ...segments],
            ).path,
          )
          .toString();
    }
    return (path: path, payload: payload);
  }
}

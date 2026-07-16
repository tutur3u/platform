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
    final response = await _api.getJson(
      StorefrontEndpoints.storefronts(wsId, status: status, query: query),
    );
    return (
      data: (response['data'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(Storefront.fromJson)
          .toList(growable: false),
      count: (response['count'] as num?)?.toInt() ?? 0,
    );
  }

  Future<Storefront> getStorefront(String wsId, String storefrontId) async {
    final response = await _api.getJson(
      StorefrontEndpoints.storefront(wsId, storefrontId),
    );
    return Storefront.fromJson(
      Map<String, dynamic>.from(response['data'] as Map),
    );
  }

  Future<Storefront> createStorefront(
    String wsId,
    Map<String, dynamic> payload,
  ) async {
    final response = await _api.postJson(
      StorefrontEndpoints.storefronts(wsId),
      payload,
    );
    return Storefront.fromJson(
      Map<String, dynamic>.from(response['data'] as Map),
    );
  }

  Future<Storefront> updateStorefront(
    String wsId,
    String storefrontId,
    Map<String, dynamic> payload,
  ) async {
    final response = await _api.patchJson(
      StorefrontEndpoints.storefront(wsId, storefrontId),
      payload,
    );
    return Storefront.fromJson(
      Map<String, dynamic>.from(response['data'] as Map),
    );
  }

  Future<void> deleteStorefront(String wsId, String storefrontId) async {
    await _api.deleteJson(StorefrontEndpoints.storefront(wsId, storefrontId));
  }

  Future<List<StorefrontListing>> listListings(
    String wsId,
    String storefrontId,
  ) async {
    final response = await _api.getJson(
      StorefrontEndpoints.listings(wsId, storefrontId),
    );
    return (response['data'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(StorefrontListing.fromJson)
        .toList(growable: false);
  }

  Future<StorefrontListing> createListing(
    String wsId,
    String storefrontId,
    Map<String, dynamic> payload,
  ) async {
    final response = await _api.postJson(
      StorefrontEndpoints.listings(wsId, storefrontId),
      payload,
    );
    return StorefrontListing.fromJson(
      Map<String, dynamic>.from(response['data'] as Map),
    );
  }

  Future<StorefrontListing> updateListing(
    String wsId,
    String storefrontId,
    String listingId,
    Map<String, dynamic> payload,
  ) async {
    final response = await _api.patchJson(
      StorefrontEndpoints.listing(wsId, storefrontId, listingId),
      payload,
    );
    return StorefrontListing.fromJson(
      Map<String, dynamic>.from(response['data'] as Map),
    );
  }

  Future<void> deleteListing(
    String wsId,
    String storefrontId,
    String listingId,
  ) async {
    await _api.deleteJson(
      StorefrontEndpoints.listing(wsId, storefrontId, listingId),
    );
  }

  void dispose() => _api.dispose();
}

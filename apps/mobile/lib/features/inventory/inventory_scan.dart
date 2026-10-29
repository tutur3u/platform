import 'package:mobile/core/router/deep_links.dart';

/// What a scanned code means to the Inventory item list.
///
/// Products have no barcode or SKU field yet, so only Tuturuuu product links
/// resolve to an item. Plain codes become a name search. Anything else with a
/// URI scheme (Wi-Fi credentials, `otpauth:`, `mailto:`, app intents, other
/// links) is unsupported and never leaves the device as a search query.
sealed class InventoryScanResult {
  const InventoryScanResult();
}

final class InventoryScanProduct extends InventoryScanResult {
  const InventoryScanProduct(this.productId);

  final String productId;
}

final class InventoryScanSearch extends InventoryScanResult {
  const InventoryScanSearch(this.query);

  final String query;
}

final class InventoryScanUnsupported extends InventoryScanResult {
  const InventoryScanUnsupported();
}

/// The products API rejects longer `q` values (`MAX_SEARCH_LENGTH`).
const inventoryScanMaxSearchLength = 500;

const _productPathPrefix = '/inventory/products/';
final _uuid = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  caseSensitive: false,
);
final _scheme = RegExp('^[a-zA-Z][a-zA-Z0-9+.-]*:');

InventoryScanResult? resolveInventoryScan(String? raw) {
  final value = raw?.trim() ?? '';
  if (value.isEmpty) return null;
  if (_scheme.hasMatch(value)) return _resolveLink(value);
  if (value.length > inventoryScanMaxSearchLength) {
    return const InventoryScanUnsupported();
  }
  return InventoryScanSearch(value);
}

InventoryScanResult _resolveLink(String value) {
  final uri = Uri.tryParse(value);
  if (uri == null ||
      (uri.scheme != 'http' && uri.scheme != 'https') ||
      uri.host.isEmpty) {
    return const InventoryScanUnsupported();
  }
  final location = resolveMobileDeepLink(uri)?.location;
  if (location == null || !location.startsWith(_productPathPrefix)) {
    return const InventoryScanUnsupported();
  }
  final productId = location.substring(_productPathPrefix.length);
  return _uuid.hasMatch(productId)
      ? InventoryScanProduct(productId.toLowerCase())
      : const InventoryScanUnsupported();
}

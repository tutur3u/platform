import 'package:mobile/core/router/deep_links.dart';

/// What a scanned code means to the Inventory item list.
///
/// Products have no barcode or SKU field yet, so only Tuturuuu product links
/// resolve to an item. Other plain codes become a name search; other links are
/// rejected rather than searched.
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

const _productPathPrefix = '/inventory/products/';

InventoryScanResult? resolveInventoryScan(String? raw) {
  final value = raw?.trim() ?? '';
  if (value.isEmpty) return null;
  final uri = Uri.tryParse(value);
  final isLink =
      uri != null &&
      (uri.scheme == 'http' || uri.scheme == 'https') &&
      uri.host.isNotEmpty;
  if (!isLink) return InventoryScanSearch(value);

  final location = resolveMobileDeepLink(uri)?.location;
  if (location != null && location.startsWith(_productPathPrefix)) {
    final productId = location.substring(_productPathPrefix.length);
    if (productId.isNotEmpty &&
        productId != 'create' &&
        !productId.contains('/')) {
      return InventoryScanProduct(productId);
    }
  }
  return const InventoryScanUnsupported();
}

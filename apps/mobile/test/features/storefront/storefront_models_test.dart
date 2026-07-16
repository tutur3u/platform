import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/storefront/storefront_models.dart';

void main() {
  test('parses storefront and listing API payloads', () {
    final storefront = Storefront.fromJson(const {
      'id': 'store-1',
      'name': 'Summer catalog',
      'slug': 'summer-catalog',
      'status': 'published',
      'visibility': 'public',
      'currency': 'VND',
      'checkoutMode': 'simulated',
      'themePreset': 'boutique',
      'layoutStyle': 'grid',
      'surfaceStyle': 'soft',
      'cornerStyle': 'rounded',
      'showInventoryBadges': true,
      'analyticsEnabled': false,
      'listingsCount': 4,
    });
    final listing = StorefrontListing.fromJson(const {
      'id': 'listing-1',
      'storefrontId': 'store-1',
      'title': 'Starter pack',
      'price': 250000,
      'compareAtPrice': 300000,
      'status': 'published',
      'maxPerOrder': 2,
      'sortOrder': 3,
      'availableQuantity': 12,
    });

    expect(storefront.isPublished, isTrue);
    expect(storefront.isPublic, isTrue);
    expect(storefront.listingsCount, 4);
    expect(listing.storefrontId, storefront.id);
    expect(listing.price, 250000);
    expect(listing.availableQuantity, 12);
  });
}

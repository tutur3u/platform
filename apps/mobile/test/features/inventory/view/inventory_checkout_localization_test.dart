import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';

void main() {
  test('cart reconciliation distinguishes one and multiple removed items', () {
    final en = AppLocalizationsEn();
    expect(en.inventoryCheckoutCartRemoved(1), contains('1 unavailable item.'));
    expect(
      en.inventoryCheckoutCartRemoved(2),
      contains('2 unavailable items.'),
    );
    expect(AppLocalizationsVi().inventoryCheckoutCartRemoved(1), contains('1'));
  });
}

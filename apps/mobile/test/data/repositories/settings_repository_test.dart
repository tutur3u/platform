import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('SettingsRepository inventory product preferences', () {
    late SettingsRepository repository;

    setUp(() {
      SharedPreferences.setMockInitialValues({});
      repository = SettingsRepository();
    });

    test('stores owner and category per workspace', () async {
      await repository.setLastInventoryProductOwner('ws_1', 'owner_1');
      await repository.setLastInventoryProductCategory('ws_1', 'category_1');
      await repository.setLastInventoryProductOwner('ws_2', 'owner_2');

      expect(
        await repository.getLastInventoryProductOwner('ws_1'),
        'owner_1',
      );
      expect(
        await repository.getLastInventoryProductCategory('ws_1'),
        'category_1',
      );
      expect(
        await repository.getLastInventoryProductOwner('ws_2'),
        'owner_2',
      );
      expect(
        await repository.getLastInventoryProductCategory('ws_2'),
        isNull,
      );
    });

    test('clears the remembered linked finance category when unset', () async {
      await repository.setLastInventoryProductFinanceCategory('ws_1', 'fin_1');
      expect(
        await repository.getLastInventoryProductFinanceCategory('ws_1'),
        'fin_1',
      );

      await repository.setLastInventoryProductFinanceCategory('ws_1', null);

      expect(
        await repository.getLastInventoryProductFinanceCategory('ws_1'),
        isNull,
      );
    });
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';

void main() {
  group('AppRegistry.moduleFromLocation', () {
    test('matches module root and nested paths', () {
      final financeRoot = AppRegistry.moduleFromLocation(Routes.finance);
      final financeNested = AppRegistry.moduleFromLocation(Routes.transactions);

      expect(financeRoot?.id, 'finance');
      expect(financeNested?.id, 'finance');
    });

    test('normalizes trailing slash', () {
      final module = AppRegistry.moduleFromLocation('${Routes.timer}/');
      expect(module?.id, 'timer');
    });
  });

  group('mini app navigation config', () {
    test('finance module exposes contextual nav items', () {
      final finance = AppRegistry.moduleById('finance');

      expect(finance, isNotNull);
      final routes = finance!.miniAppNavItems
          .map((item) => item.route)
          .toList();

      expect(routes, contains(Routes.finance));
      expect(routes, contains(Routes.transactions));
      expect(routes, contains(Routes.categories));
      expect(routes.length, greaterThanOrEqualTo(3));
    });

    test('all modules define at least one mini nav item', () {
      for (final module in AppRegistry.allModules) {
        expect(module.miniAppNavItems, isNotEmpty, reason: module.id);
      }
    });
  });
}

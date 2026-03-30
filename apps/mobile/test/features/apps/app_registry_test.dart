import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/l10n/l10n.dart';

import '../../helpers/helpers.dart';

void main() {
  group('AppRegistry.moduleFromLocation', () {
    test('matches module root and nested paths', () {
      final financeRoot = AppRegistry.moduleFromLocation(Routes.finance);
      final financeNested = AppRegistry.moduleFromLocation(Routes.transactions);
      final habitsRoot = AppRegistry.moduleFromLocation(Routes.habits);

      expect(financeRoot?.id, 'finance');
      expect(financeNested?.id, 'finance');
      expect(habitsRoot?.id, 'habits');
    });

    test('normalizes trailing slash', () {
      final module = AppRegistry.moduleFromLocation('${Routes.timer}/');
      expect(module?.id, 'timer');
    });

    test('settings hub includes profile and workspace routes', () {
      expect(
        AppRegistry.moduleFromLocation(Routes.profileRoot)?.id,
        'settings',
      );
      expect(
        AppRegistry.moduleFromLocation(Routes.settingsWorkspace)?.id,
        'settings',
      );
    });
  });

  testWidgets('settings hub module is omitted from apps hub listing', (
    tester,
  ) async {
    late List<String> moduleIds;
    await tester.pumpApp(
      Builder(
        builder: (context) {
          moduleIds = AppRegistry.modules(context).map((m) => m.id).toList();
          return const SizedBox.shrink();
        },
      ),
    );
    expect(moduleIds, isNot(contains('settings')));
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

    test('tasks module exposes estimates nav item', () {
      final tasks = AppRegistry.moduleById('tasks');

      expect(tasks, isNotNull);
      final routes = tasks!.miniAppNavItems.map((item) => item.route).toList();

      expect(routes, contains(Routes.tasks));
      expect(routes, contains(Routes.taskBoards));
      expect(routes, contains(Routes.taskEstimates));
    });

    test('habits module exposes overview and activity nav items', () {
      final habits = AppRegistry.moduleById('habits');

      expect(habits, isNotNull);
      final routes = habits!.miniAppNavItems.map((item) => item.route).toList();

      expect(routes, [Routes.habits, Routes.habitsActivity]);
    });

    test('all modules define at least one mini nav item', () {
      for (final module in AppRegistry.allModules) {
        expect(module.miniAppNavItems, isNotEmpty, reason: module.id);
      }
    });

    testWidgets('finance nav uses overview, activity, wallets, manage labels', (
      tester,
    ) async {
      late List<String> labels;

      await tester.pumpApp(
        Builder(
          builder: (context) {
            final finance = AppRegistry.moduleById('finance')!;
            labels = finance.miniAppNavItems
                .map((item) => item.labelBuilder(context.l10n))
                .toList(growable: false);
            return const SizedBox.shrink();
          },
        ),
      );

      expect(labels, ['Overview', 'Activity', 'Wallets', 'Manage']);
    });

    testWidgets('habits nav uses overview and activity labels', (tester) async {
      late List<String> labels;

      await tester.pumpApp(
        Builder(
          builder: (context) {
            final habits = AppRegistry.moduleById('habits')!;
            labels = habits.miniAppNavItems
                .map((item) => item.labelBuilder(context.l10n))
                .toList(growable: false);
            return const SizedBox.shrink();
          },
        ),
      );

      expect(labels, ['Overview', 'Activity']);
    });
  });
}

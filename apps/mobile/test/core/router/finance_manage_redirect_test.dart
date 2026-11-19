import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/deep_links.dart';
import 'package:mobile/core/router/finance_routes.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/finance/finance_module.dart';

import '../../helpers/helpers.dart';

void main() {
  test('Finance has no Manage destination', () {
    for (final item in [
      ...financeMiniAppNavItems,
      ...financeModule.miniAppNavItems,
    ]) {
      expect(item.id, isNot('finance_manage'));
      expect(item.route, isNot(Routes.financeManage));
      expect(item.aliasRoutes, isNot(contains(Routes.financeManage)));
    }
  });

  test('old Manage links open Wallets', () {
    for (final link in [
      'https://tuturuuu.com/personal/finance/manage',
      'https://tuturuuu.com/en/personal/finance/manage',
    ]) {
      expect(resolveMobileDeepLink(Uri.parse(link))?.location, Routes.wallets);
    }
  });

  testWidgets('the Manage route redirects to Wallets', (tester) async {
    final manage = financeRoutes().whereType<GoRoute>().singleWhere(
      (route) => route.path == Routes.financeManage,
    );
    expect(manage.builder, isNull);
    final router = GoRouter(
      initialLocation: Routes.financeManage,
      routes: [
        manage,
        GoRoute(
          path: Routes.wallets,
          builder: (context, state) => const Text('wallets'),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpAppRouter(router);
    await tester.pumpAndSettle();
    expect(find.text('wallets'), findsOneWidget);
    expect(router.routerDelegate.currentConfiguration.uri.path, Routes.wallets);
    expect(find.text('Create wallet'), findsNothing);
  });
}

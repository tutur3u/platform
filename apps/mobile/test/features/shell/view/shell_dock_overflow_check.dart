part of 'shell_back_navigation_test.dart';

void _registerDockOverflowCheck(
  AppTabCubit Function() appTabCubit,
  AuthCubit Function() authCubit,
  WorkspaceCubit Function() workspaceCubit,
  ShellProfileCubit Function() shellProfileCubit,
) {
  for (final width in [360.0, 834.0]) {
    testWidgets(
      'inventory More lists hidden sections and navigates at ${width}dp',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = Size(width, 1194);
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        final router = _buildRouter(initialLocation: Routes.inventorySales);
        addTearDown(router.dispose);

        await tester.pumpWidget(
          _buildTestApp(
            router: router,
            appTabCubit: appTabCubit(),
            authCubit: authCubit(),
            workspaceCubit: workspaceCubit(),
            shellProfileCubit: shellProfileCubit(),
          ),
        );
        await _pumpForTransitions(tester);

        final shellContext = tester.element(find.byType(ShellPage));
        final l10n = AppLocalizations.of(shellContext);

        Finder inDock(String text) => find.descendant(
          of: find.byType(MorphingNavigationBar),
          matching: find.text(text),
        );
        // Narrow layouts keep one more section inside More.
        expect(find.text(l10n.inventorySalesLabel), findsOneWidget);
        expect(find.text(l10n.navBack), findsNothing);
        expect(inDock(l10n.inventoryProductsLabel), findsNothing);
        expect(inDock(l10n.inventoryManageLabel), findsNothing);
        expect(inDock(l10n.storefrontTitle), findsNothing);
        final more = find.byKey(const ValueKey('shell-dock-more'));
        expect(more, findsOneWidget);
        expect(find.bySemanticsLabel(l10n.navBack), findsOneWidget);
        expect(
          find.bySemanticsLabel(l10n.inventoryProductsLabel),
          findsOneWidget,
        );

        await tester.tap(more);
        await _pumpForTransitions(tester);
        expect(find.byType(BottomSheet), findsOneWidget);
        expect(find.text(l10n.inventoryAuditLabel), findsOneWidget);
        expect(find.text(l10n.storefrontTitle), findsOneWidget);
        expect(
          find.text(l10n.inventoryManageLabel),
          width == 360 ? findsOneWidget : findsNothing,
        );
        await tester.tap(find.text(l10n.inventoryAuditLabel));
        await _pumpForTransitions(tester);
        expect(
          router.routeInformationProvider.value.uri.path,
          Routes.inventoryAuditLogs,
        );
        expect(tester.getSemantics(more), isSemantics(isSelected: true));
      },
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/widgets/app_launcher_tile.dart';
import 'package:mobile/features/apps/widgets/apps_dropdown_picker.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/helpers.dart';

void main() {
  testWidgets(
    'Apps brand button announces one label and retains tap semantics',
    (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpApp(const Scaffold(body: AppsDropdownPicker()));
      await tester.pumpAndSettle();
      final control = find.byWidgetPredicate(
        (widget) => widget is Semantics && widget.properties.button == true,
      );
      expect(control, findsOneWidget);
      final expected = tester.widget<Semantics>(control).properties.label;
      final data = tester.getSemantics(control).getSemanticsData();
      expect(data.label, expected);
      expect(data.hasAction(SemanticsAction.tap), isTrue);
      expect(data.flagsCollection.isButton, isTrue);
      expect(find.bySemanticsLabel('Tuturuuu'), findsNothing);
      handle.dispose();
    },
  );

  testWidgets(
    'pinned apps are excluded from Recents and Search stays visible',
    (tester) async {
      SharedPreferences.setMockInitialValues({
        'apps-pinned': ['calendar'],
        'apps-recent': ['calendar', 'tasks'],
      });
      final tabs = AppTabCubit(settingsRepository: SettingsRepository());
      addTearDown(tabs.close);
      await tabs.loadLastApp();
      await tester.pumpApp(
        BlocProvider.value(
          value: tabs,
          child: const Scaffold(body: AppsScreen()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('recent-calendar')), findsNothing);
      expect(find.byKey(const ValueKey('recent-tasks')), findsOneWidget);

      final search = find.byKey(const ValueKey('apps-search-field'));
      final originalPosition = tester.getTopLeft(search);
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -400));
      await tester.pumpAndSettle();
      expect(tester.getTopLeft(search), originalPosition);
    },
  );

  for (final size in [
    const Size(390, 844),
    const Size(1024, 768),
    const Size(768, 1024),
    const Size(844, 390),
  ]) {
    testWidgets('app picker searches visible apps at $size', (tester) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = size;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      SharedPreferences.setMockInitialValues({});
      final tabs = AppTabCubit(settingsRepository: SettingsRepository());
      addTearDown(tabs.close);
      final chrome = ShellChromeActionsCubit();
      addTearDown(chrome.close);
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider.value(value: tabs),
            BlocProvider.value(value: chrome),
          ],
          child: const Scaffold(
            body: Column(
              children: [
                ShellInjectedActionsHost(matchedLocation: Routes.apps),
                Expanded(child: AppsScreen()),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final search = find.byType(TextField);
      expect(search, findsOneWidget);
      expect(find.byType(Dialog), findsNothing);
      expect(find.byKey(const ValueKey('apps-screen')), findsOneWidget);
      final actions = chrome.state.resolveForLocation(Routes.apps);
      expect(actions.map((action) => action.id), ['apps-arrange']);
      expect(actions.single.inDock, isFalse);
      expect(find.byType(AppLauncherTile), findsWidgets);
      expect(find.text('Add pin'), findsOneWidget);

      await tester.enterText(search, 'calendar');
      await tester.pumpAndSettle();
      expect(find.text('Calendar'), findsOneWidget);
      expect(find.text('Tasks'), findsNothing);
      expect(find.text('Pinned'), findsNothing);
      await tester.enterText(search, 'no-such-app');
      await tester.pumpAndSettle();
      expect(find.text('No matching apps'), findsOneWidget);
      await tester.tap(find.byTooltip('Clear search'));
      await tester.pumpAndSettle();
      expect(find.text('Pinned'), findsOneWidget);
      await tester.tap(find.text('Add pin'));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Pin Tasks'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}

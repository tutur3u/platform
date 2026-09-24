import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/widgets/apps_dropdown_picker.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/helpers.dart';

void main() {
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
      expect(find.byType(TextField), findsNothing);
      expect(find.byType(Dialog), findsNothing);
      expect(find.byKey(const ValueKey('apps-screen')), findsOneWidget);
      final searchAction = chrome.state
          .resolveForLocation(Routes.apps)
          .firstWhere((action) => action.id == 'apps-search');
      expect(searchAction.inDock, isTrue);
      searchAction.onPressed!();
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'calendar');
      await tester.pumpAndSettle();
      expect(find.text('Calendar'), findsOneWidget);
      expect(find.text('Tasks'), findsNothing);
      await tester.enterText(find.byType(TextField), 'no-such-app');
      await tester.pumpAndSettle();
      expect(find.text('No matching apps'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}

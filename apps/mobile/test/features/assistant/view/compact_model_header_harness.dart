import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/widgets/shadcn_localizations_fallback.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/view/assistant_page.dart';
import 'package:mobile/features/assistant/widgets/assistant_mode_title.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

import 'background_reply_harness.dart';

class CompactModelHeaderHarness {
  final auth = ReplyAuth();
  final workspace = ReplyWorkspace();
  final repository = ReplyRepository();
  final chrome = AssistantChromeCubit();
  final actions = ShellChromeActionsCubit();
  final titles = ShellTitleOverrideCubit();
  final dock = ShellDockSlotController();
  GoRouter? router;

  BuildContext pageContext(WidgetTester tester) =>
      tester.element(find.byType(ShellDockPublisher));

  Future<void> mount(
    WidgetTester tester, {
    Locale locale = const Locale('en'),
  }) async {
    SharedPreferences.setMockInitialValues({});
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('flutter_timezone'),
      (call) async => 'UTC',
    );
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('com.llfbandit.record/messages'),
      (call) async => null,
    );
    router = GoRouter(
      initialLocation: '/assistant',
      routes: [
        GoRoute(
          path: '/assistant',
          builder: (_, _) => shad.DrawerOverlay(
            child: MultiBlocProvider(
              providers: [
                BlocProvider<AuthCubit>.value(value: auth),
                BlocProvider<WorkspaceCubit>.value(value: workspace),
                BlocProvider.value(value: chrome),
                BlocProvider.value(value: actions),
                BlocProvider.value(value: titles),
              ],
              child: ShellDockScope(
                controller: dock,
                child: FloatingShellDock(
                  location: '/assistant',
                  bottomInset: 68,
                  header: const AssistantModeTitle(),
                  navigation: const SizedBox(height: 52),
                  child: AssistantPage(
                    repository: repository,
                    preferences: AssistantPreferences(
                      currentUserId: () => auth.state.user?.id,
                    ),
                    currentActor: () => auth.state.user?.id,
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
    await tester.pumpWidget(
      shad.ShadcnApp.router(
        theme: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
        locale: locale,
        localizationsDelegates: const [
          ...AppLocalizations.localizationsDelegates,
          AppShadcnLocalizationsDelegate(),
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        routerConfig: router,
        builder: (context, child) => ShadcnMaterialBridge.appBuilder(
          context,
          MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> dispose(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    router?.dispose();
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('flutter_timezone'),
      null,
    );
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('com.llfbandit.record/messages'),
      null,
    );
    await auth.close();
    await workspace.close();
    await chrome.close();
    await actions.close();
    await titles.close();
    dock.dispose();
  }
}

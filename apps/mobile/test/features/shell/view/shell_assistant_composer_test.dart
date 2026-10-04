import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/assistant/widgets/assistant_morphing_dock.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    await supa.Supabase.initialize(
      url: 'https://synthetic.supabase.test',
      publishableKey: 'synthetic-test-key',
      authOptions: const supa.FlutterAuthClientOptions(
        autoRefreshToken: false,
        detectSessionInUri: false,
        localStorage: supa.EmptyLocalStorage(),
      ),
    );
  });
  tearDownAll(() => supa.Supabase.instance.dispose());

  // The active shell uses floating navigation at every width. This matrix
  // checks phone/tablet/desktop geometry, not the disabled compact footer.
  for (final width in [320.0, 600.0, 1024.0]) {
    testWidgets(
      'Floating Assistant dock collapses and back closes it at width $width',
      (tester) async {
        tester.view.physicalSize = Size(width, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        SharedPreferences.setMockInitialValues({});
        final auth = _Auth();
        final workspace = _Workspace();
        final profile = _Profile();
        whenListen(
          auth,
          const Stream<AuthState>.empty(),
          initialState: const AuthState.unauthenticated(),
        );
        whenListen(
          workspace,
          const Stream<WorkspaceState>.empty(),
          initialState: const WorkspaceState(
            status: WorkspaceStatus.loaded,
            currentWorkspace: Workspace(id: 'first', personal: true),
          ),
        );
        whenListen(
          profile,
          const Stream<ShellProfileState>.empty(),
          initialState: const ShellProfileState(),
        );
        final tabs = AppTabCubit(settingsRepository: SettingsRepository());
        final chrome = AssistantChromeCubit();
        final actions = ShellChromeActionsCubit();
        addTearDown(auth.close);
        addTearDown(workspace.close);
        addTearDown(profile.close);
        addTearDown(tabs.close);
        addTearDown(chrome.close);
        addTearDown(actions.close);
        final router = GoRouter(
          initialLocation: Routes.assistant,
          routes: [
            ShellRoute(
              builder: (context, state, child) => ShellPage(
                matchedLocation: state.uri.path,
                enableDebugLogs: false,
                child: child,
              ),
              routes: [
                GoRoute(
                  path: Routes.assistant,
                  builder: (_, _) => const SizedBox(),
                ),
                GoRoute(path: Routes.apps, builder: (_, _) => const SizedBox()),
              ],
            ),
          ],
        );
        addTearDown(router.dispose);
        await tester.pumpWidget(
          MultiBlocProvider(
            providers: [
              BlocProvider<AuthCubit>.value(value: auth),
              BlocProvider<WorkspaceCubit>.value(value: workspace),
              BlocProvider<ShellProfileCubit>.value(value: profile),
              BlocProvider.value(value: tabs),
              BlocProvider.value(value: chrome),
              BlocProvider.value(value: actions),
              BlocProvider(create: (_) => ShellMiniNavCubit()),
              BlocProvider(create: (_) => ShellTitleOverrideCubit()),
            ],
            child: shad.ShadcnApp.router(
              theme: const shad.ThemeData(
                colorScheme: shad.ColorSchemes.lightZinc,
              ),
              localizationsDelegates: const [
                ...AppLocalizations.localizationsDelegates,
                shad.ShadcnLocalizations.delegate,
              ],
              supportedLocales: AppLocalizations.supportedLocales,
              builder: ShadcnMaterialBridge.appBuilder,
              routerConfig: router,
            ),
          ),
        );
        Future<void> settle() async {
          for (var i = 0; i < 12; i++) {
            await tester.pump(const Duration(milliseconds: 50));
          }
        }

        await settle();
        final dockBefore = tester.state(find.byType(FloatingShellDock));
        expect(
          find.byKey(const ValueKey('compact-shell-footer')),
          findsNothing,
        );
        expect(
          find.byKey(const ValueKey('floating-shell-dock-opacity')),
          findsNothing,
        );
        expect(find.byType(AssistantMorphingDock), findsOneWidget);
        expect(
          find.byKey(const ValueKey('assistant-dock-navigation')),
          findsOneWidget,
        );
        final navigationDock = tester.widget<FloatingShellDock>(
          find.byType(FloatingShellDock),
        );
        expect(navigationDock.bottomInset, 0);
        expect(navigationDock.navigationBottomOffset, 0);

        await tester.tap(find.byType(AssistantComposerFab));
        await settle();
        expect(find.byType(AssistantMorphingDock), findsOneWidget);
        expect(
          find.byKey(const ValueKey('assistant-dock-chat')),
          findsOneWidget,
        );
        expect(
          find.byKey(const ValueKey('assistant-dock-navigation')),
          findsNothing,
        );
        expect(
          find.byKey(const ValueKey('floating-shell-dock-opacity')),
          findsNothing,
        );
        expect(
          identical(tester.state(find.byType(FloatingShellDock)), dockBefore),
          isTrue,
        );
        tester.view.viewInsets = const FakeViewPadding(bottom: 260);
        addTearDown(tester.view.resetViewInsets);
        await settle();
        expect(
          tester
              .getRect(find.byKey(const ValueKey('assistant-dock-chat')))
              .bottom,
          lessThanOrEqualTo(900 - 260),
        );
        expect(
          find.byKey(const ValueKey('floating-shell-dock-opacity')),
          findsNothing,
        );
        tester.view.resetViewInsets();
        await settle();
        await tester.binding.handlePopRoute();
        await settle();
        expect(chrome.state.navigationExpanded, isFalse);
        expect(chrome.state.composerVisible, isFalse);
        expect(
          find.byKey(const ValueKey('assistant-dock-navigation')),
          findsOneWidget,
        );
        expect(
          router.routeInformationProvider.value.uri.path,
          Routes.assistant,
        );
        chrome.enterLiveMode();
        await settle();
        expect(find.byType(AssistantMorphingDock), findsNothing);
        expect(
          find.byKey(const ValueKey('floating-shell-dock-opacity')),
          findsOneWidget,
        );
        chrome.exitLiveMode();
        await settle();
        expect(find.byType(AssistantMorphingDock), findsOneWidget);
        expect(
          find.byKey(const ValueKey('floating-shell-dock-opacity')),
          findsNothing,
        );
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'tab hiding retains draft; closing and workspace changes reset chrome',
    (tester) async {
      tester.view.physicalSize = const Size(390, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      SharedPreferences.setMockInitialValues({});
      final auth = _Auth();
      final workspace = _Workspace();
      final profile = _Profile();
      whenListen(
        auth,
        const Stream<AuthState>.empty(),
        initialState: const AuthState.unauthenticated(),
      );
      final workspaces = StreamController<WorkspaceState>.broadcast();
      addTearDown(workspaces.close);
      whenListen(
        workspace,
        workspaces.stream,
        initialState: const WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: Workspace(id: 'first', personal: true),
        ),
      );

      whenListen(
        profile,
        const Stream<ShellProfileState>.empty(),
        initialState: const ShellProfileState(),
      );
      final tabs = AppTabCubit(settingsRepository: SettingsRepository());
      final chrome = AssistantChromeCubit();
      final actions = ShellChromeActionsCubit();
      addTearDown(auth.close);
      addTearDown(workspace.close);
      addTearDown(profile.close);
      addTearDown(tabs.close);
      addTearDown(chrome.close);
      addTearDown(actions.close);
      final router = GoRouter(
        initialLocation: Routes.assistant,
        routes: [
          ShellRoute(
            builder: (context, state, child) => ShellPage(
              matchedLocation: state.uri.path,
              enableDebugLogs: false,
              child: child,
            ),
            routes: [
              GoRoute(
                path: Routes.assistant,
                builder: (_, _) => const SizedBox(),
              ),
              GoRoute(path: Routes.apps, builder: (_, _) => const SizedBox()),
              GoRoute(
                path: Routes.settings,
                builder: (_, _) => const SizedBox(),
              ),
            ],
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<WorkspaceCubit>.value(value: workspace),
            BlocProvider<ShellProfileCubit>.value(value: profile),
            BlocProvider.value(value: tabs),
            BlocProvider.value(value: chrome),
            BlocProvider.value(value: actions),
            BlocProvider(create: (_) => ShellMiniNavCubit()),
            BlocProvider(create: (_) => ShellTitleOverrideCubit()),
          ],
          child: shad.ShadcnApp.router(
            theme: const shad.ThemeData(
              colorScheme: shad.ColorSchemes.lightZinc,
            ),
            localizationsDelegates: const [
              ...AppLocalizations.localizationsDelegates,
              shad.ShadcnLocalizations.delegate,
            ],
            supportedLocales: AppLocalizations.supportedLocales,
            builder: ShadcnMaterialBridge.appBuilder,
            routerConfig: router,
          ),
        ),
      );
      Future<void> settle() async {
        for (var i = 0; i < 12; i++) {
          await tester.pump(const Duration(milliseconds: 50));
        }
      }

      await settle();

      await settle();
      Future<void> openPrompt() async {
        final compose = actions.state
            .resolveForLocation(Routes.assistant)
            .firstWhere((action) => action.id == 'assistant-compose');
        compose.onPressed!();
        await settle();
      }

      await openPrompt();
      await tester.enterText(find.byType(TextField), 'Synthetic unsent draft');
      final input = tester
          .widget<TextField>(find.byType(TextField))
          .controller!;
      final inputFocus = tester
          .widget<TextField>(find.byType(TextField))
          .focusNode!;
      expect(chrome.state.composerVisible, isTrue);
      router.go(Routes.settings);
      await settle();
      expect(chrome.state.composerVisible, isFalse);
      expect(input.text, 'Synthetic unsent draft');
      router.go(Routes.assistant);
      await settle();
      await openPrompt();
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller,
        same(input),
      );
      expect(input.text, 'Synthetic unsent draft');
      await tester.tap(
        find.byKey(const ValueKey('assistant-navigation-toggle')),
      );
      await settle();
      expect(chrome.state.composerVisible, isFalse);
      expect(chrome.state.navigationExpanded, isFalse);
      expect(find.byType(TextField), findsNothing);
      expect(inputFocus.hasFocus, isFalse);
      expect(input.text, 'Synthetic unsent draft');
      final dock = tester.widget<FloatingShellDock>(
        find.byType(FloatingShellDock),
      );
      expect(dock.bottomInset, 0);
      expect(dock.navigationBottomOffset, 0);
      expect(find.byType(AssistantMorphingDock), findsOneWidget);
      chrome.setComposerVisible(visible: false);
      await settle();
      expect(input.text, 'Synthetic unsent draft');
      expect(chrome.state.navigationExpanded, isFalse);
      await openPrompt();
      workspaces.add(
        const WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: Workspace(id: 'second', personal: true),
        ),
      );
      await settle();
      expect(input.text, isEmpty);
      expect(chrome.state.composerVisible, isFalse);
      expect(chrome.state.navigationExpanded, isFalse);
      expect(tester.takeException(), isNull);
    },
  );
}

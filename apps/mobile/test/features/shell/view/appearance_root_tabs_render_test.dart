import 'dart:io';
import 'dart:ui' as ui;

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/models/app_notification.dart' as model;
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/notifications_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/dashboard/view/dashboard_page.dart';
import 'package:mobile/features/dashboard/view/home_page.dart';
import 'package:mobile/features/notifications/view/notifications_page.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_activity_section.dart';
import 'package:mobile/features/profile/view/profile_identity_card.dart';
import 'package:mobile/features/profile/view/profile_overview_page.dart';
import 'package:mobile/features/profile/view/profile_timeline_browser.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

part 'home_render_cases.dart';
part 'notifications_render_cases.dart';
part 'profile_render_cases.dart';
part 'root_tab_render_harness.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

/// Root tabs under the app appearance plumbing, plus Home and Notifications
/// with fixture data at phone, tablet and desktop sizes (see the parts).
/// Captures are written only when `SETTINGS_RENDER_DIR` is set; assertions
/// always run.
void main() {
  setUpAll(() async {
    // Initialise outside any test's fake-async zone; the notification cases
    // read and write the cache.
    await CacheStore.instance.init();
    final material = Platform.environment['SETTINGS_MATERIAL_FONT'];
    if (material != null) {
      await (FontLoader('Roboto')
            ..addFont(File(material).readAsBytes().then(ByteData.sublistView)))
          .load();
    }
    for (final font in {
      'NotoSans': 'assets/fonts/NotoSans.ttf',
      'LucideIcons': 'assets/fonts/lucide/LucideIcons.otf',
      'MaterialIcons': 'fonts/MaterialIcons-Regular.otf',
      'packages/shadcn_flutter/LucideIcons':
          'packages/shadcn_flutter/lib/icons/LucideIcons.ttf',
    }.entries) {
      await (FontLoader(font.key)..addFont(rootBundle.load(font.value))).load();
    }
  });
  // ShellPage reports back-button state on this channel; without a handler
  // the call fails once a capture's runAsync lets real async work complete.
  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('mobile/shell_back'),
          (_) async => null,
        );
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            const MethodChannel('mobile/shell_back'),
            null,
          ),
    );
  });

  for (final sample in [
    ('classic-light', const AppearanceSettings(), shad.ThemeMode.light),
    (
      'aurora-blobs-dark',
      const AppearanceSettings(
        theme: AppearanceThemeId.aurora,
        backgroundStyle: AppearanceBackgroundStyle.blobs,
      ),
      shad.ThemeMode.dark,
    ),
  ]) {
    testWidgets('Home and Apps render under ${sample.$1}', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final settings = SettingsRepository();
      final apps = AppTabCubit(settingsRepository: settings);
      final experiments = ExperimentalAppsCubit(settingsRepository: settings);
      await experiments.load();
      final auth = _Auth();
      final workspaces = _Workspaces();
      final profile = _Profile();
      whenListen(
        auth,
        const Stream<AuthState>.empty(),
        initialState: const AuthState.unauthenticated(),
      );
      whenListen(
        workspaces,
        const Stream<WorkspaceState>.empty(),
        initialState: const WorkspaceState(
          currentWorkspace: Workspace(id: 'synthetic-personal', personal: true),
          workspaces: [Workspace(id: 'synthetic-personal', personal: true)],
        ),
      );
      whenListen(
        profile,
        const Stream<ShellProfileState>.empty(),
        initialState: const ShellProfileState(),
      );
      final router = GoRouter(
        initialLocation: Routes.home,
        routes: [
          ShellRoute(
            builder: (context, state, child) => ShellPage(
              matchedLocation: state.uri.path,
              enableDebugLogs: false,
              child: child,
            ),
            routes: [
              for (final path in [Routes.home, Routes.apps])
                GoRoute(path: path, builder: (_, _) => const SizedBox()),
              GoRoute(
                path: Routes.taskPlanning,
                builder: (_, _) => const ShellMiniNav(
                  ownerId: 'render-mini-nav',
                  locations: {Routes.taskPlanning},
                  items: [],
                ),
              ),
            ],
          ),
        ],
      );
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        router.dispose();
        await apps.close();
        await experiments.close();
        await auth.close();
        await workspaces.close();
        await profile.close();
      });
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(390, 844);
      addTearDown(tester.view.reset);
      final appearance = sample.$2;
      await tester.pumpWidget(
        MultiBlocProvider(
          providers: [
            BlocProvider.value(value: apps),
            BlocProvider.value(value: experiments),
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<WorkspaceCubit>.value(value: workspaces),
            BlocProvider<ShellProfileCubit>.value(value: profile),
            BlocProvider(create: (_) => AssistantChromeCubit()),
            BlocProvider(create: (_) => ShellMiniNavCubit()),
            BlocProvider(create: (_) => ShellTitleOverrideCubit()),
            BlocProvider(create: (_) => ShellChromeActionsCubit()),
          ],
          child: shad.ShadcnApp.router(
            theme: AppearanceTheme.shadTheme(appearance, Brightness.light),
            darkTheme: AppearanceTheme.shadTheme(appearance, Brightness.dark),
            themeMode: sample.$3,
            localizationsDelegates: const [
              ...AppLocalizations.localizationsDelegates,
              shad.ShadcnLocalizations.delegate,
            ],
            supportedLocales: AppLocalizations.supportedLocales,
            routerConfig: router,
            builder: (context, child) => RepaintBoundary(
              key: const ValueKey('root-render'),
              child: AppearanceBackdrop(
                settings: appearance,
                child: ShadcnMaterialBridge.appBuilder(context, child),
              ),
            ),
          ),
        ),
      );
      await _settle(tester);
      for (final location in [Routes.home, Routes.apps]) {
        router.go(location);
        await _settle(tester);
        if (location == Routes.home) {
          expect(find.byType(DashboardPage), findsOneWidget);
        }
        final scheme = shad.Theme.of(
          tester.element(find.byType(ShellPage)),
        ).colorScheme;
        if (!appearance.hasAmbientBackground) {
          // Classic light: the grouped page tint reaches every root tab.
          expect(scheme.background, const Color(0xFFF2F2F7));
        }
        await _capture(
          tester,
          'root-${location == Routes.home ? 'home' : 'apps'}-${sample.$1}',
        );
        expect(tester.takeException(), isNull);
      }
    });
  }

  _homeRenderCases();
  _notificationsRenderCases();
  _profileRenderCases();
}

Future<void> _capture(WidgetTester tester, String name) async {
  final output = Platform.environment['SETTINGS_RENDER_DIR'];
  if (output == null) return;
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(const ValueKey('root-render')),
    );
    final ratio = double.tryParse(
      Platform.environment['SETTINGS_RENDER_PIXEL_RATIO'] ?? '',
    );
    final image = await boundary.toImage(pixelRatio: ratio ?? 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(output).create(recursive: true);
    await File('$output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

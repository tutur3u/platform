import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/app_router.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/education/cubit/education_access_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/pump_app.dart';

const _workspace = Workspace(id: 'smoke-workspace', name: 'Smoke workspace');

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Habits extends MockCubit<HabitsAccessState>
    implements HabitsAccessCubit {}

class _Education extends MockCubit<EducationAccessState>
    implements EducationAccessCubit {}

class _Inventory extends MockCubit<InventoryAccessState>
    implements InventoryAccessCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

class _Timezone extends MockCubit<TimezoneSettingsState>
    implements TimezoneSettingsCubit {}

class _Lock extends MockCubit<AppLockState> implements AppLockCubit {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    for (final font in {
      'Roboto': 'assets/fonts/NotoSans.ttf',
      'NotoSans': 'assets/fonts/NotoSans.ttf',
      'MaterialIcons': 'fonts/MaterialIcons-Regular.otf',
      'packages/shadcn_flutter/LucideIcons':
          'packages/shadcn_flutter/lib/icons/LucideIcons.ttf',
    }.entries) {
      await (FontLoader(font.key)..addFont(rootBundle.load(font.value))).load();
    }
    SharedPreferences.setMockInitialValues({});
    await supa.Supabase.initialize(
      url: 'https://example.supabase.co',
      publishableKey: 'test-anon-key',
    );
  });

  final destinations = <String>{
    for (final module in AppRegistry.allModules) ...[
      module.route,
      for (final item in module.miniAppNavItems)
        // Threads replaces Work only behind a flag; with it off the route
        // redirects to Work by design. threads_flag_test.dart builds it.
        if (item.id != 'mastermind_threads') item.route,
    ],
  }.toList()..sort();

  for (final size in [const Size(390, 844), const Size(1024, 1366)]) {
    for (final hasWorkspace in [false, true]) {
      for (final destination in destinations) {
        testWidgets('registered destination $destination builds at $size '
            '(workspace: $hasWorkspace)', (tester) async {
          final errors = <FlutterErrorDetails>[];
          final originalOnError = FlutterError.onError;
          FlutterError.onError = (details) {
            errors.add(details);
            originalOnError?.call(details);
          };
          addTearDown(() => FlutterError.onError = originalOnError);
          SharedPreferences.setMockInitialValues({});
          tester.view
            ..devicePixelRatio = 1
            ..physicalSize = size;
          addTearDown(() {
            tester.view.resetPhysicalSize();
            tester.view.resetDevicePixelRatio();
          });
          tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
            const MethodChannel('mobile/shell_back'),
            (_) async => null,
          );
          addTearDown(() {
            tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
              const MethodChannel('mobile/shell_back'),
              null,
            );
          });

          final harness = _DestinationHarness(
            destination,
            hasWorkspace: hasWorkspace,
          );
          addTearDown(() async {
            await tester.pumpWidget(const SizedBox.shrink());
            await tester.pump();
            await harness.dispose();
          });
          await harness.mastermind.setAccess(TestAccess.enabled);
          await tester.pumpWidget(harness.build());
          for (var frame = 0; frame < 12; frame++) {
            await tester.pump(const Duration(milliseconds: 50));
            expect(
              tester.takeException(),
              isNull,
              reason: [
                '$destination frame $frame at $size',
                for (final details in errors) ...[
                  details.toString(),
                  details.stack?.toString() ?? '(Flutter supplied no stack)',
                ],
              ].join('\n'),
            );
          }
          expect(
            harness.router.routeInformationProvider.value.uri.path,
            destination,
            reason: 'A redirect must not substitute a different screen.',
          );
          expect(find.byType(ShellPage), findsOneWidget);
          expect(find.byType(ErrorWidget), findsNothing);
        });
      }
    }
  }
}

// The production router, registry builders, shell, themes, and page-owned
// providers run unchanged. Covers workspace-loading and a selected shared
// workspace without a backend session. Loaded-data branches still need feature
// fixtures; no network identity or native plugin session is established here.
class _DestinationHarness {
  _DestinationHarness(String destination, {required bool hasWorkspace}) {
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.authenticated(
        supa.User(
          id: 'smoke-user',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '2026-01-01T00:00:00Z',
        ),
      ),
    );
    whenListen(
      workspace,
      const Stream<WorkspaceState>.empty(),
      initialState: hasWorkspace
          ? const WorkspaceState(
              status: WorkspaceStatus.loaded,
              currentWorkspace: _workspace,
              workspaces: [_workspace],
            )
          : const WorkspaceState(),
    );
    whenListen(
      habits,
      const Stream<HabitsAccessState>.empty(),
      initialState: const HabitsAccessState(
        status: HabitsAccessStatus.loaded,
        enabled: true,
      ),
    );
    whenListen(
      education,
      const Stream<EducationAccessState>.empty(),
      initialState: const EducationAccessState(
        status: EducationAccessStatus.loaded,
        enabled: true,
      ),
    );
    whenListen(
      inventory,
      const Stream<InventoryAccessState>.empty(),
      initialState: const InventoryAccessState(
        status: InventoryAccessStatus.loaded,
        enabled: true,
      ),
    );
    whenListen(
      profile,
      const Stream<ShellProfileState>.empty(),
      initialState: const ShellProfileState(),
    );
    whenListen(
      timezone,
      const Stream<TimezoneSettingsState>.empty(),
      initialState: const TimezoneSettingsState(
        personal: 'UTC',
        loading: false,
        resolved: true,
      ),
    );
    whenListen(
      lock,
      const Stream<AppLockState>.empty(),
      initialState: const AppLockState(hasLoaded: true),
    );
    router = createAppRouter(
      auth,
      workspace,
      habits,
      education,
      inventory,
      apps,
      mastermindAccessCubit: mastermind.access,
      initialLocation: destination,
    );
  }

  final auth = _Auth();
  final workspace = _Workspace();
  final habits = _Habits();
  final education = _Education();
  final inventory = _Inventory();
  final profile = _Profile();
  final timezone = _Timezone();
  final lock = _Lock();
  // Real cubits over a fake hub: Mastermind is gated on a loaded access check.
  final mastermind = MastermindViewHarness();
  final settings = SettingsRepository();
  late final apps = AppTabCubit(settingsRepository: settings);
  late final experiments = ExperimentalAppsCubit(settingsRepository: settings);
  late final finance = FinancePreferencesCubit(settingsRepository: settings);
  late final locale = LocaleCubit(settingsRepository: settings);
  late final theme = ThemeCubit(settingsRepository: settings);
  final calendar = CalendarSettingsCubit();
  final chrome = ShellChromeActionsCubit();
  final miniNav = ShellMiniNavCubit();
  final title = ShellTitleOverrideCubit();
  late final GoRouter router;

  Widget build() => MultiBlocProvider(
    providers: [
      BlocProvider<AuthCubit>.value(value: auth),
      BlocProvider<WorkspaceCubit>.value(value: workspace),
      BlocProvider<HabitsAccessCubit>.value(value: habits),
      BlocProvider<EducationAccessCubit>.value(value: education),
      BlocProvider<InventoryAccessCubit>.value(value: inventory),
      BlocProvider<ShellProfileCubit>.value(value: profile),
      BlocProvider<TimezoneSettingsCubit>.value(value: timezone),
      BlocProvider<AppLockCubit>.value(value: lock),
      BlocProvider<MastermindAccessCubit>.value(value: mastermind.access),
      BlocProvider<MastermindSnapshotCubit>.value(value: mastermind.snapshot),
      RepositoryProvider<MastermindRuntime>.value(value: mastermind.runtime),
      BlocProvider.value(value: apps),
      BlocProvider.value(value: experiments),
      BlocProvider.value(value: finance),
      BlocProvider.value(value: locale),
      BlocProvider.value(value: theme),
      BlocProvider.value(value: calendar),
      BlocProvider.value(value: chrome),
      BlocProvider.value(value: miniNav),
      BlocProvider.value(value: title),
    ],
    child: shellTestApp(router: router),
  );

  Future<void> dispose() async {
    router.dispose();
    await Future.wait([
      auth.close(),
      workspace.close(),
      habits.close(),
      education.close(),
      inventory.close(),
      profile.close(),
      timezone.close(),
      lock.close(),
      mastermind.dispose(),
      apps.close(),
      experiments.close(),
      finance.close(),
      locale.close(),
      theme.close(),
      calendar.close(),
      chrome.close(),
      miniNav.close(),
      title.close(),
    ]);
  }
}

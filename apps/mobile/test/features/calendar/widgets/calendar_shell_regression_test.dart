import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/widgets/shadcn_localizations_fallback.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/calendar/view/calendar_page.dart';
import 'package:mobile/features/calendar/widgets/agenda_view.dart';
import 'package:mobile/features/calendar/widgets/calendar_minute_clock.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

class _Timezone extends MockCubit<TimezoneSettingsState>
    implements TimezoneSettingsCubit {}

class _CalendarRepository extends CalendarRepository {
  final initial = Completer<List<CalendarEvent>>();
  List<CalendarEvent> events = const [];
  int requests = 0;

  @override
  Future<List<CalendarEvent>> getEvents(
    String wsId, {
    DateTime? start,
    DateTime? end,
  }) {
    requests++;
    return requests == 1 ? initial.future : Future.value(events);
  }
}

enum _Result { loaded, empty, error }

Future<void> _frames(WidgetTester tester) async {
  for (var frame = 0; frame < 12; frame++) {
    await tester.pump(const Duration(milliseconds: 50));
    expect(tester.takeException(), isNull, reason: 'frame $frame');
  }
}

Future<void> _progress(
  WidgetTester tester,
  bool Function() complete,
) async {
  for (var turn = 0; turn < 100 && !complete(); turn++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
  }
  expect(complete(), isTrue, reason: 'The owned async fixture must complete.');
}

Future<void> _operation(
  WidgetTester tester,
  Future<void> Function() operation,
) async {
  var complete = false;
  Object? failure;
  unawaited(
    operation().then<void>(
      (_) {
        complete = true;
      },
      onError: (Object error) {
        failure = error;
        complete = true;
      },
    ),
  );
  await _progress(tester, () => complete);
  expect(failure, isNull);
}

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
    await CacheStore.instance.init();
  });

  tearDownAll(() async {
    await CacheStore.instance.closeForTesting();
  });

  final runId = DateTime.now().microsecondsSinceEpoch;
  var nextScope = 0;
  for (final size in [const Size(390, 844), const Size(1024, 1366)]) {
    for (final brightness in Brightness.values) {
      for (final result in _Result.values) {
        testWidgets('real shell Agenda ${result.name} at $size / $brightness', (
          tester,
        ) async {
          SharedPreferences.setMockInitialValues({});
          CalendarCubit.clearCache();
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
          final repository = _CalendarRepository();
          final workspace = Workspace(
            id: 'calendar-shell-$runId-${nextScope++}',
            name: 'Calendar shell workspace',
          );
          final harness = _CalendarShellHarness(
            repository,
            brightness,
            workspace,
          );
          addTearDown(() async {
            await tester.pumpWidget(const SizedBox.shrink());
            await tester.pump();
            await harness.dispose();
            repository.dispose();
          });
          await tester.pumpWidget(harness.build());
          await _frames(tester);
          expect(find.byType(ShellPage), findsOneWidget);
          expect(find.byType(NovaLoadingIndicator), findsOneWidget);
          expect(repository.requests, 1);

          final calendar = tester
              .element(find.byType(CalendarMinuteClock))
              .read<CalendarCubit>();
          await _operation(
            tester,
            () => calendar.setViewMode(CalendarViewMode.agenda),
          );
          await _frames(tester);
          expect(calendar.state.viewMode, CalendarViewMode.agenda);

          final now = DateTime.now().toUtc();
          final date = DateTime.utc(now.year, now.month, now.day);
          final events = [
            CalendarEvent(
              id: 'all-day',
              title: 'All-day shell regression',
              startAt: date,
              endAt: date.add(const Duration(days: 1)),
              wsId: workspace.id,
            ),
            CalendarEvent(
              id: 'timed',
              title: 'Timed shell regression',
              description: 'Loaded event description',
              startAt: date.add(const Duration(hours: 12)),
              endAt: date.add(const Duration(hours: 13)),
              wsId: workspace.id,
            ),
          ];
          repository.events = result == _Result.empty ? const [] : events;
          if (result == _Result.error) {
            repository.initial.completeError(
              Exception('Synthetic calendar transport failure'),
            );
          } else {
            repository.initial.complete(repository.events);
          }
          await _progress(
            tester,
            () => calendar.state.status != CalendarStatus.loading,
          );
          await _frames(tester);

          if (result == _Result.error) {
            expect(calendar.state.status, CalendarStatus.error);
            expect(
              find.textContaining('Synthetic calendar transport failure'),
              findsWidgets,
            );
            expect(find.text('Retry'), findsOneWidget);
            await _operation(
              tester,
              () => calendar.loadEvents(workspace.id, forceRefresh: true),
            );
            await _frames(tester);
          }
          // The loaded frame precedes persistence. Observe publication without
          // introducing a second same-key write while the first is in flight.
          await _progress(tester, () {
            final published = CacheStore.instance.peek<Map<String, dynamic>>(
              key: CacheKey(
                namespace: 'calendar.events.utc.v2',
                userId: currentCacheUserId(),
                workspaceId: workspace.id,
                locale: currentCacheLocaleTag(),
              ),
              decode: (json) => Map<String, dynamic>.from(json as Map),
            );
            return published.data?['hasLoadedOnce'] == true &&
                published.data?['lastUpdatedAt'] ==
                    calendar.state.lastUpdatedAt?.toIso8601String();
          });
          expect(calendar.state.status, CalendarStatus.loaded);
          expect(find.byType(AgendaView), findsOneWidget);
          if (result == _Result.empty) {
            final l10n = tester.element(find.byType(AgendaView)).l10n;
            expect(find.text(l10n.calendarAgendaEmpty), findsOneWidget);
          } else {
            expect(find.text('All-day shell regression'), findsOneWidget);
            expect(find.text('Timed shell regression'), findsOneWidget);
          }
          expect(find.byType(ErrorWidget), findsNothing);
          await tester.pump(const Duration(seconds: 6));
          await tester.pump(const Duration(milliseconds: 50));
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}

class _CalendarShellHarness {
  _CalendarShellHarness(this.repository, this.brightness, this.scope) {
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.unauthenticated(),
    );
    whenListen(
      workspace,
      const Stream<WorkspaceState>.empty(),
      initialState: WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: [scope],
        currentWorkspace: scope,
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
    router = GoRouter(
      initialLocation: Routes.calendar,
      routes: [
        ShellRoute(
          builder: (context, state, child) => ShellPage(
            matchedLocation: state.uri.path,
            enableDebugLogs: false,
            child: child,
          ),
          routes: [
            GoRoute(
              path: Routes.calendar,
              builder: (_, _) => CalendarPage(
                repositoryFactory: () => repository,
              ),
            ),
          ],
        ),
      ],
    );
  }

  final _CalendarRepository repository;
  final Brightness brightness;
  final Workspace scope;
  final auth = _Auth();
  final workspace = _Workspace();
  final profile = _Profile();
  final timezone = _Timezone();
  final settings = SettingsRepository();
  late final apps = AppTabCubit(settingsRepository: settings);
  late final experiments = ExperimentalAppsCubit(settingsRepository: settings);
  final calendarSettings = CalendarSettingsCubit();
  final chrome = ShellChromeActionsCubit();
  final miniNav = ShellMiniNavCubit();
  final title = ShellTitleOverrideCubit();
  final assistant = AssistantChromeCubit();
  late final GoRouter router;

  Widget build() => MultiBlocProvider(
    providers: [
      BlocProvider<AuthCubit>.value(value: auth),
      BlocProvider<WorkspaceCubit>.value(value: workspace),
      BlocProvider<ShellProfileCubit>.value(value: profile),
      BlocProvider<TimezoneSettingsCubit>.value(value: timezone),
      BlocProvider.value(value: apps),
      BlocProvider.value(value: experiments),
      BlocProvider.value(value: calendarSettings),
      BlocProvider.value(value: chrome),
      BlocProvider.value(value: miniNav),
      BlocProvider.value(value: title),
      BlocProvider.value(value: assistant),
    ],
    child: shad.ShadcnApp.router(
      theme: AppearanceTheme.shadTheme(const AppearanceSettings(), brightness),
      localizationsDelegates: const [
        ...AppLocalizations.localizationsDelegates,
        AppShadcnLocalizationsDelegate(),
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
      builder: (context, child) => AppearanceBackdrop(
        settings: const AppearanceSettings(),
        child: ShadcnMaterialBridge(child: child!),
      ),
    ),
  );

  Future<void> dispose() async {
    router.dispose();
    await Future.wait([
      auth.close(),
      workspace.close(),
      profile.close(),
      timezone.close(),
      apps.close(),
      experiments.close(),
      calendarSettings.close(),
      chrome.close(),
      miniNav.close(),
      title.close(),
      assistant.close(),
    ]);
  }
}

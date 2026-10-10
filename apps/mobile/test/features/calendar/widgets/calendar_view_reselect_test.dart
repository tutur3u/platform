import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/view/calendar_page.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';
import 'package:mobile/features/calendar/widgets/timeline_zoom_viewport.dart';
import 'package:mobile/features/calendar/widgets/week_view.dart';
import 'package:mobile/features/calendar/widgets/year_view.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Timezone extends MockCubit<TimezoneSettingsState>
    implements TimezoneSettingsCubit {}

class _CalendarSettings extends MockCubit<CalendarSettingsState>
    implements CalendarSettingsCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  for (final zone in ['UTC', 'Pacific/Kiritimati']) {
    for (final (mode, preference) in [
      ...CalendarViewMode.values.map((mode) => (mode, FirstDayOfWeek.auto_)),
      (CalendarViewMode.week, FirstDayOfWeek.sunday),
      (CalendarViewMode.week, FirstDayOfWeek.monday),
      (CalendarViewMode.week, FirstDayOfWeek.saturday),
    ]) {
      testWidgets(
        'selected ${mode.name}/${preference.name}/$zone dock returns to current calendar date',
        (tester) async {
          SharedPreferences.setMockInitialValues({});
          tester.view.physicalSize = const Size(390, 844);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final auth = _Auth();
          final workspace = _Workspaces();
          final profile = _Profile();
          final settings = _CalendarSettings();
          final timezone = _Timezone();
          whenListen(
            timezone,
            const Stream<TimezoneSettingsState>.empty(),
            initialState: TimezoneSettingsState(
              personal: zone,
              resolved: true,
              loading: false,
            ),
          );
          whenListen(
            settings,
            const Stream<CalendarSettingsState>.empty(),
            initialState: CalendarSettingsState(userPreference: preference),
          );
          whenListen(
            auth,
            const Stream<AuthState>.empty(),
            initialState: const AuthState.unauthenticated(),
          );
          whenListen(
            workspace,
            const Stream<WorkspaceState>.empty(),
            initialState: const WorkspaceState(),
          );
          whenListen(
            profile,
            const Stream<ShellProfileState>.empty(),
            initialState: const ShellProfileState(),
          );
          final apps = AppTabCubit(settingsRepository: SettingsRepository());
          final experiments = ExperimentalAppsCubit(
            settingsRepository: SettingsRepository(),
          );
          await experiments.load();
          final router = GoRouter(
            initialLocation: Routes.calendar,
            routes: [
              ShellRoute(
                builder: (_, state, child) => ShellPage(
                  matchedLocation: state.uri.path,
                  enableDebugLogs: false,
                  child: child,
                ),
                routes: [
                  GoRoute(
                    path: Routes.calendar,
                    builder: (_, _) => const CalendarPage(),
                  ),
                ],
              ),
            ],
          );
          addTearDown(() async {
            router.dispose();
            await auth.close();
            await workspace.close();
            await profile.close();
            await settings.close();
            await timezone.close();
            await apps.close();
            await experiments.close();
          });
          await tester.pumpWidget(
            MultiBlocProvider(
              providers: [
                BlocProvider<AuthCubit>.value(value: auth),
                BlocProvider<WorkspaceCubit>.value(value: workspace),
                BlocProvider<ShellProfileCubit>.value(value: profile),
                BlocProvider.value(value: apps),
                BlocProvider.value(value: experiments),
                BlocProvider(create: (_) => AssistantChromeCubit()),
                BlocProvider(create: (_) => ShellMiniNavCubit()),
                BlocProvider(create: (_) => ShellTitleOverrideCubit()),
                BlocProvider(create: (_) => ShellChromeActionsCubit()),
                BlocProvider<CalendarSettingsCubit>.value(value: settings),
                BlocProvider<TimezoneSettingsCubit>.value(value: timezone),
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
          await _settle(tester);
          final context = tester.element(find.byType(MultiDayScheduleView));
          final cubit = context.read<CalendarCubit>();
          final now = calendarWallDate(DateTime.now(), zone);
          final past = DateTime.utc(now.year - 1, 1, 10);
          cubit.selectDate(past);
          await cubit.setViewMode(mode);
          await _settle(tester);
          final id = switch (mode) {
            CalendarViewMode.agenda => 'agenda',
            CalendarViewMode.year => 'year',
            _ => 'calendar',
          };
          expect(cubit.state.viewMode, mode);
          final button = find.byKey(
            ValueKey('injected-mini-nav-calendar-view-modes-$id'),
          );
          expect(button, findsOneWidget);
          await tester.tap(button);
          await _settle(tester);
          expect(cubit.state.viewMode, mode);
          expect(
            cubit.state.effectiveSelectedDate,
            DateTime.utc(now.year, now.month, now.day),
          );
          expect(
            cubit.state.effectiveFocusedMonth,
            DateTime.utc(now.year, now.month),
          );
          if (mode == CalendarViewMode.week) {
            final week = tester.widget<WeekView>(find.byType(WeekView));
            expect(
              week.firstDayOfWeek,
              settings.state.resolvedFirstDayIndex('en'),
            );
          }
          if (mode == CalendarViewMode.year) {
            final yearScroll = find.descendant(
              of: find.byType(YearView),
              matching: find.byType(Scrollable),
            );
            tester.state<ScrollableState>(yearScroll).position.jumpTo(400);
            await tester.tap(button);
            await _settle(tester);
            expect(
              tester.state<ScrollableState>(yearScroll).position.pixels,
              0,
            );
            expect(cubit.state.viewMode, CalendarViewMode.year);
          }
          if ([
            CalendarViewMode.day,
            CalendarViewMode.threeDays,
            CalendarViewMode.week,
          ].contains(mode)) {
            final original = tester.state(find.byType(MultiDayScheduleView));
            final viewport = tester.widget<TimelineZoomViewport>(
              find.byType(TimelineZoomViewport),
            );
            final vertical = viewport.verticalController.offset;
            final horizontal = viewport.horizontalControllers.last.offset;
            for (var repeat = 0; repeat < 3; repeat++) {
              viewport.verticalController.jumpTo(vertical == 0 ? 100 : 0);
              viewport.horizontalControllers.last.jumpTo(horizontal + 100);
              await tester.tap(button);
              await _settle(tester);
              expect(cubit.state.viewMode, mode);
              expect(
                cubit.state.effectiveSelectedDate,
                DateTime.utc(now.year, now.month, now.day),
              );
              expect(
                viewport.verticalController.offset,
                closeTo(vertical, 0.1),
              );
              expect(
                viewport.horizontalControllers.last.offset,
                closeTo(horizontal, 0.1),
              );
              expect(
                tester.state(find.byType(MultiDayScheduleView)),
                same(original),
              );
            }
          }
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump();
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}

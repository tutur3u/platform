import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/view/assistant_settings_route_frame.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_overflow.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/shell/view/shell_workspace_picker.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

const _storageKey = 'shell-dock-root-tabs-v1';

Future<GoRouter> _pumpShell(
  WidgetTester tester, {
  String location = Routes.home,
  Size size = const Size(390, 844),
  List<String>? savedTabs,
  double safeRight = 0,
  ValueNotifier<int>? badgeCount,
}) async {
  SharedPreferences.setMockInitialValues({_storageKey: ?savedTabs});
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size
    ..padding = FakeViewPadding(right: safeRight);
  addTearDown(tester.view.reset);
  final settings = SettingsRepository();
  final tabs = AppTabCubit(settingsRepository: settings);
  final experiments = ExperimentalAppsCubit(settingsRepository: settings);
  await experiments.load();
  final auth = _Auth();
  final workspace = _Workspace();
  final profile = _Profile();
  whenListen(
    auth,
    const Stream<AuthState>.empty(),
    initialState: const AuthState.unauthenticated(),
  );
  when(workspace.refreshHiddenWorkspaces).thenAnswer((_) async {});
  when(() => workspace.hasAuthenticatedActor).thenReturn(false);
  whenListen(
    workspace,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      status: WorkspaceStatus.loaded,
      workspaces: [Workspace(id: 'ws', name: 'Studio')],
      currentWorkspace: Workspace(id: 'ws', name: 'Studio'),
    ),
  );
  whenListen(
    profile,
    const Stream<ShellProfileState>.empty(),
    initialState: const ShellProfileState(),
  );
  final router = GoRouter(
    initialLocation: location,
    routes: [
      ShellRoute(
        builder: (context, state, child) => ShellPage(
          matchedLocation: state.uri.path,
          enableDebugLogs: false,
          assistantPageBuilder: (_) => const Text('assistant'),
          homePageBuilder: (_) => const Text('home'),
          notificationsPageBuilder: (_) => const Text('notifications'),
          profilePageBuilder: (_) => const Text('profile'),
          badgeCount: badgeCount,
          child: child,
        ),
        routes: [
          for (final route in [
            Routes.home,
            Routes.apps,
            Routes.assistant,
            Routes.notifications,
            Routes.notificationsArchive,
            Routes.profileRoot,
            Routes.tasks,
            Routes.calendar,
            Routes.mail,
            Routes.finance,
            Routes.inventorySales,
            Routes.settings,
          ])
            GoRoute(path: route, builder: (_, _) => Text(route)),
        ],
      ),
    ],
  );
  addTearDown(() async {
    await tester.pumpWidget(const SizedBox.shrink());
    router.dispose();
    await tabs.close();
    await experiments.close();
    await auth.close();
    await workspace.close();
    await profile.close();
  });
  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider.value(value: tabs),
        BlocProvider.value(value: experiments),
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<WorkspaceCubit>.value(value: workspace),
        BlocProvider<ShellProfileCubit>.value(value: profile),
        BlocProvider(create: (_) => AssistantChromeCubit()),
        BlocProvider(create: (_) => ShellChromeActionsCubit()),
        BlocProvider(create: (_) => ShellMiniNavCubit()),
        BlocProvider(create: (_) => ShellTitleOverrideCubit()),
      ],
      child: shellTestApp(router: router),
    ),
  );
  await _settle(tester);
  return router;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 14; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

List<Key?> _expectIconSlots(WidgetTester tester, int count) {
  final slots = tester
      .widgetList<ShellDockSlotButton>(find.byType(ShellDockSlotButton))
      .toList();
  expect(slots.length, count);
  for (final slot in slots) {
    expect(
      find.descendant(
        of: find.byWidget(slot),
        matching: find.text(slot.entry.label),
      ),
      findsNothing,
    );
  }
  return slots.map((slot) => slot.key).toList();
}

void main() {
  for (final size in [const Size(390, 844), const Size(1024, 768)]) {
    testWidgets('Notifications updates its badge in place at ${size.width}dp', (
      tester,
    ) async {
      final count = ValueNotifier(0);
      addTearDown(count.dispose);
      await _pumpShell(tester, size: size, badgeCount: count);
      final alerts = find.byKey(ShellRootTab.notifications.key);
      final badge = find.descendant(
        of: alerts,
        matching: find.byKey(const ValueKey('notifications-unread-badge')),
      );
      final bounds = tester.getRect(alerts);
      expect(badge, findsNothing);

      count.value = 3;
      await tester.pump();
      expect(badge, findsOneWidget);
      expect(tester.getRect(alerts), bounds);

      count.value = 0;
      await tester.pump();
      expect(badge, findsNothing);
      expect(tester.getRect(alerts), bounds);
    });
  }

  for (final width in [390.0, 834.0]) {
    testWidgets('root shows five accessible icons at ${width}dp', (
      tester,
    ) async {
      final router = await _pumpShell(
        tester,
        size: Size(width, 1194),
        savedTabs: ['tasks', 'calendar'],
      );
      final dock = find.byType(MorphingNavigationBar);
      expect(
        _expectIconSlots(tester, 5),
        ShellRootTab.values.map((tab) => tab.key),
      );
      expect(find.byKey(shellDockMoreKey), findsNothing);
      for (final label in [
        'Home',
        'Apps',
        'Mira',
        'Notifications',
        'Profile',
      ]) {
        expect(
          find.descendant(of: dock, matching: find.bySemanticsLabel(label)),
          findsOneWidget,
        );
      }
      final apps = find.byKey(ShellRootTab.apps.key);
      await tester.longPress(apps);
      await tester.pumpAndSettle();
      expect(find.text('Apps'), findsOneWidget);
      expect(router.routeInformationProvider.value.uri.path, Routes.home);
      Tooltip.dismissAllToolTips();
      await tester.tap(find.byKey(ShellRootTab.profile.key));
      await _settle(tester);
      expect(
        router.routeInformationProvider.value.uri.path,
        Routes.profileRoot,
      );
    });
  }

  for (final width in [320.0, 360.0]) {
    for (final route in [Routes.home, Routes.inventorySales]) {
      testWidgets(
        'priority actions preserve overflow slots at ${width}dp on $route',
        (tester) async {
          await _pumpShell(
            tester,
            size: Size(width, 844),
            location: route,
            safeRight: route == Routes.home ? 8 : 0,
          );
          final slots = find.byType(ShellDockSlotButton);
          List<Key?> slotKeys() => tester
              .widgetList<ShellDockSlotButton>(slots)
              .map((slot) => slot.key)
              .toList();
          final expected = slotKeys();
          expect(expected, contains(shellDockMoreKey));
          final chrome = tester
              .element(find.byType(ShellPage))
              .read<ShellChromeActionsCubit>();
          var taps = 0;
          for (final filled in [false, true]) {
            chrome.register(
              registrationId: 'fixture-action',
              ownerId: 'fixture-action',
              locations: {route},
              actions: [
                ShellActionSpec(
                  id: 'fixture-action',
                  icon: Icons.save,
                  tooltip: 'Save fixture',
                  filled: filled,
                  inDock: true,
                  onPressed: () => taps++,
                ),
              ],
            );
            await tester.pump();
            expect(slotKeys(), expected);
            await _settle(tester);
            expect(slotKeys(), expected);

            final dockAction = find.byKey(
              const ValueKey(('dock-primary', 'fixture-action')),
            );
            final headerAction = find.byKey(
              const ValueKey('shell-action-button-fixture-action'),
            );
            expect(dockAction, findsOneWidget);
            expect(headerAction, findsNothing);
            await tester.tap(dockAction);
          }
          expect(taps, 2);
          chrome.unregister('fixture-action');
          await _settle(tester);
          expect(slotKeys(), expected);
        },
      );
    }
  }

  for (final width in [390.0, 834.0]) {
    testWidgets('standalone Mira settings use the shared dock at ${width}dp', (
      tester,
    ) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = Size(width, 844)
        ..padding = const FakeViewPadding(bottom: 34);
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        sorbetTestApp(
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () => Navigator.of(context).push<void>(
                MaterialPageRoute(
                  builder: (_) => const AssistantSettingsRouteFrame(
                    title: 'Mira settings',
                    child: Text('Settings content'),
                  ),
                ),
              ),
              child: const Text('Open settings'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open settings'));
      await tester.pumpAndSettle();
      final surface = find.byKey(
        const ValueKey('persistent-shell-dock-material'),
      );
      final back = find.byKey(const ValueKey('shell-dock-back'));
      final center = tester.getRect(
        find.byKey(const ValueKey('floating-dock-navigation-slot')),
      );
      expect(center.bottom, 844 - ShellDockMetrics.bottomOffset(34));
      expect(surface, findsNothing);
      final button = tester.getRect(back);
      expect(button.right + ShellDockMetrics.zoneGap, center.left);
      expect(button.size, const Size.square(ShellDockMetrics.slot));
      await tester.tap(back);
      await tester.pumpAndSettle();
      expect(find.text('Mira settings'), findsNothing);
    });
  }

  testWidgets('all root headers show one workspace picker in the same place', (
    tester,
  ) async {
    final router = await _pumpShell(tester);
    final picker = find.byType(ShellWorkspacePicker);
    final bounds = tester.getRect(picker);
    for (final tab in ShellRootTab.values) {
      router.go(tab.route);
      await _settle(tester);
      expect(picker, findsOneWidget, reason: tab.name);
      expect(tester.getRect(picker), bounds, reason: tab.name);
      expect(bounds.size, const Size.square(44));
      await tester.tap(picker);
      await _settle(tester);
      expect(find.byType(AppSheetScaffold), findsOneWidget);
      expect(find.text('Studio'), findsOneWidget);
      Navigator.of(tester.element(find.byType(AppSheetScaffold))).pop();
      await _settle(tester);
    }
    for (final route in [Routes.settings, Routes.tasks, Routes.finance]) {
      router.go(route);
      await _settle(tester);
      expect(picker, findsNothing, reason: route);
    }
  });

  testWidgets('a root search keeps the workspace picker in place', (
    tester,
  ) async {
    await _pumpShell(tester);
    final picker = find.byType(ShellWorkspacePicker);
    final bounds = tester.getRect(picker);
    final search = TextEditingController();
    addTearDown(search.dispose);
    tester
        .element(find.byType(ShellPage))
        .read<ShellChromeActionsCubit>()
        .register(
          registrationId: 'fixture-search',
          ownerId: 'fixture-search',
          locations: const {Routes.home},
          actions: [
            ShellActionSpec(
              id: 'fixture-search',
              icon: Icons.search,
              searchController: search,
            ),
          ],
        );
    await _settle(tester);
    expect(find.byKey(const ValueKey('shell-search-query')), findsOneWidget);
    expect(picker, findsOneWidget);
    expect(tester.getRect(picker), bounds);
  });

  for (final size in [const Size(390, 844), const Size(834, 1194)]) {
    testWidgets(
      'dock keeps three fixed slots across routed screens at ${size.width}dp',
      (tester) async {
        final router = await _pumpShell(tester, size: size);
        final material = find.byKey(
          const ValueKey('persistent-shell-dock-material'),
        );
        final back = find.byKey(const ValueKey('shell-dock-back'));
        final left = find.byKey(const ValueKey('floating-dock-back-slot'));
        final center = find.byKey(
          const ValueKey('floating-dock-navigation-slot'),
        );
        final right = find.byKey(const ValueKey('floating-dock-primary-slot'));
        final slots = [left, center, right];
        final bounds = slots.map(tester.getRect).toList();
        final [leftRect, centerRect, rightRect] = bounds;
        expect(leftRect.size, const Size.square(ShellDockMetrics.slot));
        expect(rightRect.size, leftRect.size);
        expect(centerRect.center.dx, size.width / 2);
        expect(leftRect.right + ShellDockMetrics.zoneGap, centerRect.left);
        expect(centerRect.right + ShellDockMetrics.zoneGap, rightRect.left);
        expect(leftRect.center.dy, centerRect.center.dy);
        expect(rightRect.center.dy, centerRect.center.dy);
        expect(
          centerRect.width,
          ShellDockMetrics.widthFor(size.width) -
              2 * ShellDockMetrics.actionSlot,
        );
        expect(back, findsNothing);
        expect(tester.getRect(material), centerRect);

        for (final route in [
          Routes.notificationsArchive,
          Routes.finance,
          Routes.tasks,
          Routes.calendar,
          Routes.settings,
        ]) {
          router.go(route);
          await _settle(tester);
          expect(slots.map(tester.getRect), bounds, reason: route);
          expect(tester.getRect(back), leftRect, reason: route);
          if (route == Routes.settings || route == Routes.calendar) {
            expect(material, findsNothing);
            expect(find.byType(ShellDockSlotButton), findsNothing);
          } else {
            expect(tester.getRect(material), centerRect, reason: route);
          }
        }

        var saves = 0;
        tester
            .element(find.byType(ShellPage))
            .read<ShellChromeActionsCubit>()
            .register(
              registrationId: 'fixture-save',
              ownerId: 'fixture-save',
              locations: const {Routes.settings},
              actions: [
                ShellActionSpec(
                  id: 'fixture-save',
                  icon: Icons.save,
                  tooltip: 'Save fixture',
                  inDock: true,
                  onPressed: () => saves++,
                ),
              ],
            );
        await _settle(tester);
        expect(slots.map(tester.getRect), bounds);
        final save = find.byTooltip('Save fixture');
        expect(tester.getRect(save), rightRect);
        await tester.tap(save);
        expect(saves, 1);
      },
    );
  }
}

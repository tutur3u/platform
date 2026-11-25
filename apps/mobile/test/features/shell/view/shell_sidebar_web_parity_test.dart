import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/shell/view/shell_navigation_rail.dart';
import 'package:mobile/features/shell/view/shell_sidebar_workspace_switcher.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_body.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import 'shell_rail_harness.dart';

const _user = User(
  id: 'lan',
  email: 'lan@example.test',
  appMetadata: {},
  userMetadata: {'display_name': 'Lan Nguyen'},
  aud: 'authenticated',
  createdAt: '',
);

const _desktop = Size(1440, 900);
const _phone = Size(390, 844);

const _design = Workspace(id: 'ws-design', name: 'Design Studio');
const _workspaces = WorkspaceState(
  status: WorkspaceStatus.loaded,
  workspaces: [
    _design,
    Workspace(id: 'ws-ops', name: 'Operations'),
  ],
  currentWorkspace: _design,
);

Finder _inRail(Finder matching) =>
    find.descendant(of: find.byType(ShellNavigationRail), matching: matching);

Future<RailShell> _pump(
  WidgetTester tester, {
  Size size = _desktop,
  String location = Routes.home,
  ThemeCubit? theme,
  LocaleCubit? locale,
}) {
  useShellWindow(tester, size);
  return pumpRailShell(
    tester,
    location,
    authState: const AuthState.authenticated(_user),
    workspaceState: _workspaces,
    homePage: (_) => const SizedBox.shrink(),
    theme: theme,
    locale: locale,
  );
}

Future<void> _openAccountMenu(WidgetTester tester) async {
  await tester.tap(
    _inRail(find.byTooltip(shellL10n(tester).authAccountsTitle)),
  );
  await settleShell(tester);
}

void main() {
  setUp(mockShellBackChannel);

  testWidgets('the account menu lists the web items in order', (tester) async {
    final settings = SettingsRepository();
    final theme = ThemeCubit(settingsRepository: settings);
    final locale = LocaleCubit(settingsRepository: settings);
    addTearDown(theme.close);
    addTearDown(locale.close);
    await _pump(tester, theme: theme, locale: locale);
    final l10n = shellL10n(tester);

    await _openAccountMenu(tester);
    final header = find.byKey(shellAccountMenuHeaderKey);
    expect(
      find.descendant(of: header, matching: find.text('Lan Nguyen')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: header, matching: find.text('lan@example.test')),
      findsOneWidget,
    );
    final order = [
      l10n.settingsSwitchWorkspace,
      l10n.profileTitle,
      l10n.navSettings,
      l10n.settingsLanguage,
      l10n.settingsTheme,
      l10n.authSwitchAccount,
      l10n.authAddAccount,
      l10n.authManageAccounts,
      l10n.authLogOut,
    ];
    final tops = [
      for (final label in order) tester.getTopLeft(find.text(label)).dy,
    ];
    expect(tops.first, greaterThan(tester.getBottomLeft(header).dy - 1));
    for (var i = 1; i < tops.length; i++) {
      expect(tops[i], greaterThan(tops[i - 1]), reason: order[i]);
    }

    // Escape closes the menu without leaving the page.
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await settleShell(tester);
    expect(header, findsNothing);
  });

  testWidgets('Settings in the account menu opens Settings', (tester) async {
    await _pump(tester);
    final l10n = shellL10n(tester);

    await _openAccountMenu(tester);
    await tester.tap(find.text(l10n.navSettings));
    await settleShell(tester);

    expect(find.text(Routes.settings), findsOneWidget);
    expect(find.byKey(shellAccountMenuHeaderKey), findsNothing);
  });

  testWidgets('the Theme submenu changes the theme mode', (tester) async {
    final theme = ThemeCubit(settingsRepository: SettingsRepository());
    addTearDown(theme.close);
    await _pump(tester, theme: theme);
    final l10n = shellL10n(tester);
    expect(theme.state.themeMode.name, ThemeMode.system.name);

    await _openAccountMenu(tester);
    await tester.tap(find.text(l10n.settingsTheme));
    await settleShell(tester);
    await tester.tap(find.text(l10n.settingsThemeDark));
    await settleShell(tester);

    expect(theme.state.themeMode.name, ThemeMode.dark.name);
    expect(find.text(l10n.settingsThemeDark), findsNothing);
  });

  testWidgets('Log out asks before signing out', (tester) async {
    final shell = await _pump(tester);
    final l10n = shellL10n(tester);
    when(shell.auth.signOutCurrentAccount).thenAnswer((_) async => true);

    await _openAccountMenu(tester);
    await tester.tap(find.text(l10n.authLogOut));
    await settleShell(tester);
    expect(find.text(l10n.authLogOutConfirmDialogTitle), findsOneWidget);

    await tester.tap(find.text(l10n.commonCancel));
    await settleShell(tester);
    verifyNever(shell.auth.signOutCurrentAccount);

    await _openAccountMenu(tester);
    await tester.tap(find.text(l10n.authLogOut));
    await settleShell(tester);
    await tester.tap(find.text(l10n.authLogOut).last);
    await settleShell(tester);
    verify(shell.auth.signOutCurrentAccount).called(1);
  });

  testWidgets('the sidebar opens a searchable workspace list', (tester) async {
    await _pump(tester);
    final switcher = _inRail(find.byKey(shellSidebarWorkspaceSwitcherKey));
    expect(switcher, findsOneWidget);
    expect(
      find.descendant(of: switcher, matching: find.text('Design Studio')),
      findsOneWidget,
    );
    final home = _inRail(find.bySemanticsLabel(shellL10n(tester).navHome));
    expect(
      tester.getRect(switcher).bottom,
      lessThanOrEqualTo(tester.getRect(home).top),
    );

    await tester.tap(switcher);
    await settleShell(tester);
    expect(find.byKey(workspacePickerFilterKey), findsOneWidget);
  });

  testWidgets('the sidebar collapses to icons and expands again', (
    tester,
  ) async {
    await _pump(tester);
    final l10n = shellL10n(tester);
    final rail = find.byKey(const ValueKey('shell-navigation-rail'));
    final expandedWidth = tester.getSize(rail).width;
    expect(_inRail(find.text(l10n.navApps)), findsOneWidget);

    Future<void> choose(String mode) async {
      await tester.tap(_inRail(find.byTooltip(l10n.appearanceSidebarTitle)));
      await settleShell(tester);
      await tester.tap(find.text(mode).last);
      await settleShell(tester);
    }

    await choose(l10n.appearanceSidebarCollapsed);
    expect(tester.getSize(rail).width, lessThan(expandedWidth));
    expect(_inRail(find.text(l10n.navApps)), findsNothing);
    expect(_inRail(find.text('Design Studio')), findsNothing);
    expect(_inRail(find.byKey(shellSidebarWorkspaceSwitcherKey)), findsOne);

    await choose(l10n.appearanceSidebarExpanded);
    expect(tester.getSize(rail).width, expandedWidth);
    expect(_inRail(find.text(l10n.navApps)), findsOneWidget);
  });

  testWidgets('a phone opens the sidebar as a drawer from its avatar', (
    tester,
  ) async {
    final shell = await _pump(tester, size: _phone);
    final l10n = shellL10n(tester);
    final button = find.byKey(shellSidebarDrawerButtonKey);
    expect(find.byType(ShellNavigationRail), findsNothing);
    expect(button, findsOneWidget);
    // The top bar row carries no Back control; the dock below owns it.
    final barBottom = tester.getRect(button).bottom;
    final backLabels = find.text(l10n.navBack);
    for (var i = 0; i < backLabels.evaluate().length; i++) {
      expect(tester.getTopLeft(backLabels.at(i)).dy, greaterThan(barBottom));
    }

    await tester.tap(button);
    await settleShell(tester);
    final drawer = find.byKey(shellSidebarDrawerKey);
    expect(drawer, findsOneWidget);
    expect(tester.getRect(drawer).left, 0);
    expect(tester.getRect(drawer).width, lessThanOrEqualTo(320));
    for (final finder in [
      find.byKey(shellSidebarWorkspaceSwitcherKey),
      find.byType(ShellSidebarAccount),
      find.text(l10n.navApps),
      find.text('Lan Nguyen'),
    ]) {
      expect(find.descendant(of: drawer, matching: finder), findsOneWidget);
    }
    // The dock owns Back; the drawer adds no Back control of its own.
    expect(
      find.descendant(of: drawer, matching: find.text(l10n.navBack)),
      findsNothing,
    );

    await tester.binding.handlePopRoute();
    await settleShell(tester);
    expect(drawer, findsNothing);
    expect(shell.path, Routes.home);

    await tester.tap(button);
    await settleShell(tester);
    await tester.tap(
      find.descendant(of: drawer, matching: find.text(l10n.navApps)),
    );
    await settleShell(tester);
    expect(drawer, findsNothing);
    expect(shell.path, Routes.apps);
    expect(tester.takeException(), isNull);
  });
}

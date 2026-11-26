import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/account_presentation.dart';
import 'package:mobile/features/shell/view/shell_navigation_rail.dart';
import 'package:mobile/features/shell/view/shell_workspace_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/fake_sidebar_preferences.dart';
import 'shell_rail_harness.dart';

const _user = User(
  id: 'lan',
  email: 'lan@example.test',
  appMetadata: {},
  userMetadata: {'display_name': 'Lan Nguyen'},
  aud: 'authenticated',
  createdAt: '',
);

void main() {
  useFakeSidebarPreferences();
  setUp(mockShellBackChannel);

  for (final (size, extended) in [
    (const Size(1280, 800), true),
    (const Size(1180, 820), false),
    // Portrait tablets get the icon rail from web's md breakpoint.
    (const Size(834, 1194), false),
    (const Size(768, 1024), false),
  ]) {
    testWidgets('wide shell places brand and account at ${size.width}dp', (
      tester,
    ) async {
      useShellWindow(tester, size);
      final shell = await pumpRailShell(
        tester,
        Routes.home,
        authState: const AuthState.authenticated(_user),
        homePage: (_) => const SizedBox.shrink(),
      );
      final l10n = shellL10n(tester);
      var customizationOpened = false;
      shell.actions.register(
        registrationId: 'home-dashboard-fixture',
        ownerId: 'home-dashboard',
        locations: const {Routes.home},
        actions: [
          ShellActionSpec(
            id: 'home-timeline',
            icon: LucideIcons.history,
            tooltip: l10n.profileTimelineTitle,
            onPressed: () {},
          ),
          ShellActionSpec(
            id: 'home-customize',
            icon: Icons.tune_rounded,
            tooltip: l10n.homeCustomize,
            onPressed: () => customizationOpened = true,
          ),
        ],
      );
      await settleShell(tester);

      final rail = find.byType(ShellNavigationRail);
      Finder inRail(Finder matching) =>
          find.descendant(of: rail, matching: matching);
      final logo = inRail(
        find.byWidgetPredicate(
          (widget) =>
              widget is Image &&
              widget.image is AssetImage &&
              (widget.image as AssetImage).assetName ==
                  'assets/logos/transparent.png',
        ),
      );
      final footer = inRail(find.byType(ShellSidebarAccount));
      final avatar = inRail(find.byType(AccountAvatar));
      expect(logo, findsOneWidget);
      expect(avatar, findsOneWidget);
      for (final label in [l10n.appTitle, 'Lan Nguyen', 'lan@example.test']) {
        expect(
          inRail(find.text(label)),
          extended ? findsOneWidget : findsNothing,
        );
      }
      final home = railItem(l10n.navHome);
      expect(tester.getRect(logo).bottom, lessThan(tester.getRect(home).top));
      expect(
        tester.getRect(footer).top,
        greaterThan(tester.getRect(home).bottom),
      );
      expect(tester.getRect(footer).bottom, greaterThan(size.height - 30));
      expect(railItem(l10n.profileTitle), findsNothing);
      expect(find.byType(ShellWorkspacePicker), findsNothing);
      expect(find.byTooltip(l10n.profileTimelineTitle), findsNothing);
      expect(find.byTooltip(l10n.homeCustomize), findsNothing);

      final trigger = inRail(find.byTooltip(l10n.authAccountsTitle));
      expect(trigger, findsOneWidget);
      if (extended) {
        Focus.of(tester.element(avatar)).requestFocus();
        await tester.pump();
        await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      } else {
        await tester.tap(trigger);
      }
      await settleShell(tester);
      for (final label in [
        l10n.authSwitchAccount,
        l10n.authManageAccounts,
        l10n.settingsSwitchWorkspace,
        l10n.profileTitle,
        l10n.navSettings,
        l10n.profileTimelineTitle,
        l10n.homeCustomize,
        l10n.authLogOut,
      ]) {
        expect(find.text(label), findsOneWidget);
      }
      // The menu opens beside the rail and stays inside the window.
      final logOut = tester.getRect(find.text(l10n.authLogOut));
      expect(logOut.left, greaterThan(tester.getRect(rail).right));
      expect(logOut.right, lessThanOrEqualTo(size.width));

      await tester.binding.handlePopRoute();
      await settleShell(tester);
      expect(shell.path, Routes.home);
      expect(find.text(l10n.authSwitchAccount), findsNothing);

      await tester.tap(trigger);
      await settleShell(tester);
      await tester.tap(find.text(l10n.homeCustomize));
      await settleShell(tester);
      expect(customizationOpened, isTrue);

      await tester.tap(trigger);
      await settleShell(tester);
      await tester.tap(find.text(l10n.authManageAccounts));
      await settleShell(tester);
      expect(find.text(Routes.settingsAccounts), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('Mira page actions stay in the header across rail and dock', (
    tester,
  ) async {
    useShellWindow(tester, const Size(1280, 800));
    final shell = await pumpRailShell(tester, Routes.assistant);
    final l10n = shellL10n(tester);
    shell.actions.register(
      registrationId: 'mira-chrome-fixture',
      ownerId: 'mira-chrome',
      locations: const {Routes.assistant},
      actions: [
        ShellActionSpec(
          id: 'assistant-conversations',
          icon: LucideIcons.history,
          tooltip: l10n.assistantConversationsTitle,
        ),
        ShellActionSpec(
          id: 'assistant-new-conversation',
          icon: LucideIcons.messageSquarePlus,
          tooltip: l10n.assistantNewConversation,
        ),
      ],
    );
    await settleShell(tester);

    final account = find.byTooltip(l10n.authAccountsTitle);
    final picker = find.byType(ShellWorkspacePicker);
    final history = find.byTooltip(l10n.assistantConversationsTitle);
    final newChat = find.byTooltip(l10n.assistantNewConversation);
    expect(account, findsOneWidget);
    expect(picker, findsNothing);
    expect(history, findsOneWidget);
    expect(newChat, findsOneWidget);

    await resizeShellWindow(tester, const Size(390, 844));
    expect(account, findsNothing);
    expect(picker, findsOneWidget);
    expect(history, findsOneWidget);
    expect(newChat, findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

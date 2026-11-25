import 'dart:async';

import 'package:flutter/material.dart' hide ThemeMode;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/router/draft_route_guard.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/profile/view/profile_account_actions.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/view/account_presentation.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' show ThemeMode;

/// Key of the account menu's name and email header.
const shellAccountMenuHeaderKey = ValueKey<String>('shell-account-menu-header');

/// What the account menu needs from its trigger.
class ShellAccountMenuData {
  const ShellAccountMenuData({
    required this.identity,
    required this.profile,
    required this.matchedLocation,
    required this.includeWorkspacePicker,
    required this.onProfileSelected,
    this.homeActions = const [],
    this.onNavigate,
  });

  final AccountIdentity? identity;
  final ShellProfileState? profile;
  final String matchedLocation;
  final bool includeWorkspacePicker;

  /// Opens Profile; the shell closes any drawer first.
  final VoidCallback onProfileSelected;

  /// Home's Timeline and Customize actions, listed after Settings.
  final List<ShellActionSpec> homeActions;

  /// Runs before the menu leaves the current page, such as closing a drawer.
  final VoidCallback? onNavigate;
}

/// The account menu in the web order: who is signed in; workspace, profile
/// and settings; language and theme; accounts; then Log out, which asks
/// first.
List<Widget> shellAccountMenuChildren(
  BuildContext context,
  ShellAccountMenuData data,
) {
  final l10n = context.l10n;
  final colors = AppTokens.of(context).colorScheme;
  void navigate(String route) {
    final router = GoRouter.of(context);
    data.onNavigate?.call();
    unawaited(router.push<void>(route));
  }

  return [
    if (data.identity case final identity?) ...[
      _ShellAccountMenuHeader(identity: identity),
      const Divider(height: AppSpacing.sm),
    ],
    if (data.includeWorkspacePicker)
      _item(
        l10n.settingsSwitchWorkspace,
        LucideIcons.layers,
        () => unawaited(
          showWorkspacePicker(
            context,
            // Switching workspace over an open draft would discard it.
            canSelect: () => !DraftRouteGuard.instance.hasBlockingRoute,
          ),
        ),
      ),
    _item(
      l10n.profileTitle,
      LucideIcons.circleUserRound,
      data.onProfileSelected,
    ),
    _item(
      l10n.navSettings,
      LucideIcons.settings,
      () => navigate(Routes.settings),
    ),
    for (final action in data.homeActions)
      _item(
        action.tooltip ?? action.id,
        action.icon,
        action.enabled && !action.isLoading && action.onPressed != null
            ? () {
                // Pages and sheets open above the shell, so a drawer that
                // holds this menu closes first.
                data.onNavigate?.call();
                action.onPressed!();
              }
            : null,
      ),
    const Divider(height: AppSpacing.sm),
    ?_languageMenu(context),
    ?_themeMenu(context),
    const Divider(height: AppSpacing.sm),
    _item(
      l10n.authSwitchAccount,
      LucideIcons.users,
      () => unawaited(
        showProfileAccountSwitcher(
          context,
          profile: data.profile?.profile,
          avatarUrl: data.profile?.avatarUrl,
          beforeNavigate: data.onNavigate,
        ),
      ),
    ),
    _item(
      l10n.authAddAccount,
      LucideIcons.userPlus,
      () => unawaited(startAddAccountFlow(context)),
    ),
    _item(
      l10n.authManageAccounts,
      LucideIcons.userCog,
      () => navigate(Routes.settingsAccounts),
    ),
    const Divider(height: AppSpacing.sm),
    _item(
      l10n.authLogOut,
      LucideIcons.logOut,
      () => unawaited(confirmProfileSignOut(context)),
      color: colors.destructive,
    ),
  ];
}

Widget? _themeMenu(BuildContext context) {
  final cubit = context.watch<ThemeCubit?>();
  if (cubit == null) return null;
  final l10n = context.l10n;
  final current = cubit.state.themeMode;
  return SubmenuButton(
    leadingIcon: const Icon(LucideIcons.palette, size: 18),
    menuChildren: [
      for (final (mode, label, icon) in [
        (ThemeMode.light, l10n.settingsThemeLight, LucideIcons.sun),
        (ThemeMode.dark, l10n.settingsThemeDark, LucideIcons.moon),
        (ThemeMode.system, l10n.settingsThemeSystem, LucideIcons.monitor),
      ])
        _choice(
          label,
          icon,
          selected: mode == current,
          onPressed: () => unawaited(cubit.setThemeMode(mode)),
        ),
    ],
    child: Text(l10n.settingsTheme),
  );
}

Widget? _languageMenu(BuildContext context) {
  final cubit = context.watch<LocaleCubit?>();
  if (cubit == null) return null;
  final l10n = context.l10n;
  final current = cubit.state.locale?.languageCode;
  return SubmenuButton(
    leadingIcon: const Icon(LucideIcons.languages, size: 18),
    menuChildren: [
      _choice(
        l10n.settingsLanguageSystem,
        LucideIcons.monitor,
        selected: current == null,
        onPressed: () => unawaited(cubit.clearLocale()),
      ),
      for (final (code, label) in [
        ('en', l10n.settingsLanguageEnglish),
        ('vi', l10n.settingsLanguageVietnamese),
      ])
        _choice(
          label,
          LucideIcons.languages,
          selected: code == current,
          onPressed: () => unawaited(cubit.setLocale(Locale(code))),
        ),
    ],
    child: Text(l10n.settingsLanguage),
  );
}

Widget _choice(
  String label,
  IconData icon, {
  required bool selected,
  required VoidCallback onPressed,
}) => Semantics(
  selected: selected,
  child: MenuItemButton(
    leadingIcon: Icon(selected ? LucideIcons.check : icon, size: 18),
    onPressed: selected
        ? null
        : () {
            unawaited(AppHaptics.selection());
            onPressed();
          },
    child: Text(label),
  ),
);

Widget _item(
  String label,
  IconData? icon,
  VoidCallback? onPressed, {
  Color? color,
}) => MenuItemButton(
  leadingIcon: Icon(icon, size: 18, color: color),
  onPressed: onPressed == null
      ? null
      : () {
          unawaited(AppHaptics.selection());
          onPressed();
        },
  child: Text(label, style: TextStyle(color: color)),
);

class _ShellAccountMenuHeader extends StatelessWidget {
  const _ShellAccountMenuHeader({required this.identity});

  final AccountIdentity identity;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final email = identity.email;
    return ConstrainedBox(
      key: shellAccountMenuHeaderKey,
      constraints: const BoxConstraints(maxWidth: 280),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              identity.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: tokens.typography.ui.copyWith(fontWeight: FontWeight.w600),
            ),
            if (email != null && email.isNotEmpty && email != identity.name)
              Text(
                email,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: tokens.typography.xSmall.copyWith(
                  color: tokens.colorScheme.mutedForeground,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// The Home page's account actions that the sidebar menu lists.
Iterable<ShellActionSpec> shellHomeAccountActions(
  ShellChromeActionsCubit? chrome,
  String location,
) {
  if (location != Routes.home) return const [];
  return chrome?.state
          .resolveForLocation(location)
          .where(isShellSidebarAction) ??
      const [];
}

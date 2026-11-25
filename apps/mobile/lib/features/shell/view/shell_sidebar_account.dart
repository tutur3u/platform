import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/profile/view/profile_account_actions.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/view/account_presentation.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// The profile and account menu pinned to the bottom of the wide shell.
class ShellSidebarAccount extends StatelessWidget {
  const ShellSidebarAccount({
    required this.extended,
    required this.matchedLocation,
    required this.onProfileSelected,
    required this.includeWorkspacePicker,
    super.key,
  });

  final bool extended;
  final String matchedLocation;
  final VoidCallback onProfileSelected;
  final bool includeWorkspacePicker;

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<ShellProfileCubit?>()?.state;
    final identity = context.select<AuthCubit?, AccountIdentity?>(
      (cubit) => cubit == null
          ? null
          : activeAccountIdentity(
              cubit.state,
              profile: profile?.profile,
              avatarUrl: profile?.avatarUrl,
            ),
    );
    final workspace = context
        .select((WorkspaceCubit? cubit) => cubit?.state.currentWorkspace);
    final l10n = context.l10n;
    final subtitle =
        identity?.email ??
        (workspace == null ? null : displayWorkspaceName(context, workspace));
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final selected = matchedLocation == Routes.profileRoot;
    final radius = tokens.interface.borderRadius(AppRadius.sm);
    final avatar = identity == null
        ? const Icon(LucideIcons.circleUserRound, size: 28)
        : AccountAvatar(identity: identity, size: 32);

    return SizedBox(
      width: extended ? double.infinity : 52,
      child: LayoutBuilder(
        builder: (context, constraints) => Semantics(
          button: true,
          selected: selected,
          value: identity?.name,
          child: PopupMenuButton<VoidCallback>(
            key: ValueKey(identity?.id),
            tooltip: l10n.authAccountsTitle,
            requestFocus: true,
            offset: Offset(
              (Directionality.of(context) == TextDirection.ltr ? 1 : -1) *
                  (constraints.maxWidth + AppSpacing.sm),
              0,
            ),
            color: colors.popover,
            shape: RoundedRectangleBorder(
              borderRadius: radius,
              side: BorderSide(color: colors.border),
            ),
            borderRadius: radius,
            onSelected: (action) {
              unawaited(AppHaptics.selection());
              action();
            },
            itemBuilder: (_) => [
              _menuItem(
                l10n.authSwitchAccount,
                LucideIcons.users,
                () => unawaited(
                  showProfileAccountSwitcher(
                    context,
                    profile: profile?.profile,
                    avatarUrl: profile?.avatarUrl,
                  ),
                ),
                bindBack: true,
              ),
              _menuItem(
                l10n.authManageAccounts,
                LucideIcons.userCog,
                () => unawaited(context.push<void>(Routes.settingsAccounts)),
              ),
              if (includeWorkspacePicker)
                _menuItem(
                  l10n.settingsSwitchWorkspace,
                  LucideIcons.layers,
                  () => showWorkspacePickerSheet(context),
                ),
              const PopupMenuDivider(),
              _menuItem(
                l10n.profileTitle,
                LucideIcons.circleUserRound,
                onProfileSelected,
              ),
              _menuItem(
                l10n.navSettings,
                LucideIcons.settings,
                () => unawaited(context.push<void>(Routes.settings)),
              ),
              for (final action in _homeAccountActions(context, matchedLocation))
                _menuItem(
                  action.tooltip ?? action.id,
                  action.icon,
                  () => _invokeHomeAccountAction(context, action.id),
                  enabled: action.enabled && !action.isLoading,
                ),
              const PopupMenuDivider(),
              _menuItem(
                l10n.authLogOut,
                LucideIcons.logOut,
                () => unawaited(confirmProfileSignOut(context)),
                color: colors.destructive,
              ),
            ],
            child: ExcludeSemantics(
              child: Ink(
                decoration: BoxDecoration(
                  color: selected ? colors.muted : null,
                  borderRadius: radius,
                ),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 52),
                  child: extended
                      ? Padding(
                          padding: const EdgeInsets.all(AppSpacing.sm),
                          child: Row(
                            spacing: AppSpacing.sm,
                            children: [
                              avatar,
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      identity?.name ?? l10n.authAccountsTitle,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: tokens.typography.ui.copyWith(
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    if (subtitle != null)
                                      Text(
                                        subtitle,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: tokens.typography.xSmall
                                            .copyWith(
                                              color: colors.mutedForeground,
                                            ),
                                      ),
                                  ],
                                ),
                              ),
                              const Icon(LucideIcons.chevronsUpDown, size: 16),
                            ],
                          ),
                        )
                      : Center(child: avatar),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

Iterable<ShellActionSpec> _homeAccountActions(
  BuildContext context,
  String location,
) {
  if (location != Routes.home) return const [];
  final chrome = context.read<ShellChromeActionsCubit?>();
  return chrome?.state.resolveForLocation(location).where(isShellSidebarAction) ??
      const [];
}

void _invokeHomeAccountAction(BuildContext context, String id) {
  final location = GoRouter.of(context).state.uri.path;
  for (final action in _homeAccountActions(context, location)) {
    if (action.id == id && action.enabled && !action.isLoading) {
      action.onPressed?.call();
      return;
    }
  }
}

PopupMenuItem<VoidCallback> _menuItem(
  String label,
  IconData? icon,
  VoidCallback onSelected, {
  bool bindBack = false,
  bool enabled = true,
  Color? color,
}) {
  final row = Row(
    spacing: AppSpacing.md,
    children: [
      Icon(icon, size: 18, color: color),
      Flexible(child: Text(label, style: TextStyle(color: color))),
    ],
  );
  return PopupMenuItem(
    value: onSelected,
    enabled: enabled,
    // One binding handles Back for the whole popup route.
    child: bindBack ? AppModalBinding(child: row) : row,
  );
}

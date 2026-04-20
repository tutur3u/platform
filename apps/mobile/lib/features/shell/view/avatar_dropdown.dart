import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/view/account_switcher_sheet.dart';
import 'package:mobile/features/shell/view/avatar_dropdown_menu.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart';

class AvatarDropdown extends StatefulWidget {
  const AvatarDropdown({super.key});

  @override
  State<AvatarDropdown> createState() => _AvatarDropdownState();
}

class _AvatarDropdownState extends State<AvatarDropdown> {
  final GlobalKey _triggerKey = GlobalKey(
    debugLabel: 'avatar-dropdown-trigger',
  );

  Future<void> _handleAction(AvatarMenuAction action) async {
    String? matchedLocation;
    try {
      matchedLocation = GoRouterState.of(context).matchedLocation;
    } on Exception catch (_) {
      matchedLocation = null;
    }

    switch (action) {
      case AvatarMenuAction.workspace:
        showWorkspacePickerSheet(context);
        return;
      case AvatarMenuAction.profile:
        if (matchedLocation == Routes.profileRoot) {
          return;
        }
        context.go(Routes.profileRoot);
        return;
      case AvatarMenuAction.settings:
        if (matchedLocation == Routes.settings) {
          return;
        }
        context.go(Routes.settings);
        return;
      case AvatarMenuAction.switchAccount:
        await _showAccountSwitcher();
        return;
      case AvatarMenuAction.logout:
        await _signOutCurrentAccount();
        return;
    }
  }

  Future<void> _showAccountSwitcher() async {
    final authCubit = context.read<AuthCubit>();
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    await authCubit.syncCurrentSessionToStore();
    if (!mounted) {
      return;
    }

    final currentState = authCubit.state;
    final accounts = [...currentState.accounts]
      ..sort((a, b) => b.lastActiveAt.compareTo(a.lastActiveAt));

    if (accounts.isEmpty) {
      if (!toastContext.mounted) {
        return;
      }
      shad.showToast(
        context: toastContext,
        builder: (toastContext, _) => shad.Alert(
          title: Text(toastContext.l10n.authNoStoredAccounts),
        ),
      );
      return;
    }

    final selected = await showAccountSwitcherSheet(
      context,
      onAddAccount: _startAddAccountFlow,
    );

    if (!mounted || selected == null) {
      return;
    }

    final latestState = authCubit.state;
    if (selected == latestState.activeAccountId) {
      return;
    }

    final success = await authCubit.switchAccount(selected);
    if (!mounted) {
      return;
    }
    if (!toastContext.mounted) {
      return;
    }

    shad.showToast(
      context: toastContext,
      builder: (toastContext, _) => success
          ? shad.Alert(title: Text(toastContext.l10n.authSwitchAccountSuccess))
          : shad.Alert.destructive(
              title: Text(
                authCubit.state.error ??
                    toastContext.l10n.authSwitchAccountFailed,
              ),
            ),
    );
  }

  Future<void> _startAddAccountFlow() async {
    final authCubit = context.read<AuthCubit>();
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final started = await authCubit.beginAddAccountFlow();
    if (!mounted) {
      return;
    }
    if (!started) {
      if (!toastContext.mounted) {
        return;
      }
      shad.showToast(
        context: toastContext,
        builder: (toastContext, _) => shad.Alert.destructive(
          title: Text(
            authCubit.state.error ?? toastContext.l10n.authAddAccountFailed,
          ),
        ),
      );
      return;
    }
    context.go(Routes.addAccount);
  }

  Future<void> _signOutCurrentAccount() async {
    final authCubit = context.read<AuthCubit>();
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final confirmed = await showSettingsConfirmationDialog(
      context: context,
      title: context.l10n.authLogOutConfirmDialogTitle,
      description: context.l10n.authLogOutConfirmDialogBody,
      confirmLabel: context.l10n.authLogOut,
      isDestructive: true,
    );

    if (confirmed != true || !mounted) {
      return;
    }

    final success = await authCubit.signOutCurrentAccount();
    if (!mounted) {
      return;
    }
    if (!toastContext.mounted) {
      return;
    }

    shad.showToast(
      context: toastContext,
      builder: (toastContext, _) => success
          ? shad.Alert(title: Text(toastContext.l10n.authLogOutCurrentSuccess))
          : shad.Alert.destructive(
              title: Text(
                authCubit.state.error ??
                    toastContext.l10n.authLogOutCurrentFailed,
              ),
            ),
    );
  }

  Future<void> _openMenu(AvatarDropdownMenuData data) async {
    final action = await showAvatarDropdownMenu(
      context: context,
      triggerKey: _triggerKey,
      data: data,
    );
    if (!mounted || action == null) {
      return;
    }
    await _handleAction(action);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final user = context.select<AuthCubit, User?>((cubit) => cubit.state.user);
    final hasShellProfileCubit = context.read<ShellProfileCubit?>() != null;
    final shellProfileState = hasShellProfileCubit
        ? context.select<ShellProfileCubit, ShellProfileState>(
            (cubit) => cubit.state,
          )
        : const ShellProfileState();

    final currentWorkspace = context.select<WorkspaceCubit, Workspace?>(
      (cubit) => cubit.state.currentWorkspace,
    );
    final workspaceName = displayWorkspaceNameOrFallback(
      context,
      currentWorkspace,
    );

    final email = user?.email;
    final meta = user?.userMetadata;
    final fallbackAvatarUrl = _nonEmpty(meta?['avatar_url'] as String?);
    final fallbackFullName = _nonEmpty(meta?['full_name'] as String?);
    final fallbackDisplayName = _nonEmpty(meta?['display_name'] as String?);

    if (shellProfileState.error != null) {
      debugPrint(
        'AvatarDropdown shell profile load failed: ${shellProfileState.error}',
      );
    }

    final profile = shellProfileState.profile;
    final avatarUrl = shellProfileState.avatarUrl ?? fallbackAvatarUrl;
    final fullName = _nonEmpty(profile?.fullName) ?? fallbackFullName;
    final displayName = _nonEmpty(profile?.displayName) ?? fallbackDisplayName;
    final name = fullName ?? displayName ?? email ?? l10n.settingsProfile;

    final data = AvatarDropdownMenuData(
      name: name,
      email: email,
      avatarUrl: avatarUrl,
      avatarIdentityKey: shellProfileState.avatarIdentityKey,
      workspaceName: workspaceName,
      currentWorkspace: currentWorkspace,
    );

    return AvatarDropdownTrigger(
      triggerKey: _triggerKey,
      data: data,
      onPressed: () => unawaited(_openMenu(data)),
    );
  }

  String? _nonEmpty(String? value) {
    if (value == null || value.isEmpty) {
      return null;
    }
    return value;
  }
}

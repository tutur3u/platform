import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/view/avatar_dropdown_menu.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
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
    switch (action) {
      case AvatarMenuAction.workspace:
        showWorkspacePickerSheet(context);
        return;
      case AvatarMenuAction.profile:
        await context.push(Routes.profileRoot);
        return;
      case AvatarMenuAction.settings:
        await context.push(Routes.settings);
        return;
      case AvatarMenuAction.logout:
        await context.read<AuthCubit>().signOut();
        return;
    }
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

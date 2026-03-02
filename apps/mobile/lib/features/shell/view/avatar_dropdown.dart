import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Card, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart'; // For User type

class AvatarDropdown extends StatelessWidget {
  const AvatarDropdown({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    // Explicit generic type to avoid type annotation on closure parameter
    final user = context.select<AuthCubit, User?>((cubit) => cubit.state.user);
    final email = user?.email;
    final meta = user?.userMetadata;
    final avatarUrl = meta?['avatar_url'] as String?;
    final fullName = meta?['full_name'] as String?;
    final displayName = meta?['display_name'] as String?;
    final name = fullName ?? displayName ?? email;

    return PopupMenuButton<String>(
      offset: const Offset(0, 48),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: theme.colorScheme.border),
      ),
      color: theme.colorScheme.popover,
      itemBuilder: (context) => [
        PopupMenuItem<String>(
          value: 'workspace',
          child: Row(
            children: [
              Icon(
                Icons.swap_horiz,
                size: 16,
                color: theme.colorScheme.popoverForeground,
              ),
              const SizedBox(width: 8),
              Text(
                l10n.workspacePickerTitle,
                style: theme.typography.p.copyWith(
                  color: theme.colorScheme.popoverForeground,
                ),
              ),
            ],
          ),
        ),
        const PopupMenuDivider(),
        PopupMenuItem<String>(
          value: 'profile',
          child: Row(
            children: [
              Icon(
                Icons.person_outline,
                size: 16,
                color: theme.colorScheme.popoverForeground,
              ),
              const SizedBox(width: 8),
              Text(
                l10n.settingsProfile,
                style: theme.typography.p.copyWith(
                  color: theme.colorScheme.popoverForeground,
                ),
              ),
            ],
          ),
        ),
        PopupMenuItem<String>(
          value: 'settings',
          child: Row(
            children: [
              Icon(
                Icons.settings_outlined,
                size: 16,
                color: theme.colorScheme.popoverForeground,
              ),
              const SizedBox(width: 8),
              Text(
                l10n.settingsTitle,
                style: theme.typography.p.copyWith(
                  color: theme.colorScheme.popoverForeground,
                ),
              ),
            ],
          ),
        ),
        const PopupMenuDivider(),
        PopupMenuItem<String>(
          value: 'logout',
          child: Row(
            children: [
              Icon(
                Icons.logout,
                size: 16,
                color: theme.colorScheme.destructive,
              ),
              const SizedBox(width: 8),
              Text(
                l10n.authLogOut,
                style: theme.typography.p.copyWith(
                  color: theme.colorScheme.destructive,
                ),
              ),
            ],
          ),
        ),
      ],
      onSelected: (value) {
        switch (value) {
          case 'workspace':
            showWorkspacePickerSheet(context);
          case 'profile':
            unawaited(context.push(Routes.profileRoot));
          case 'settings':
            unawaited(context.push(Routes.settings));
          case 'logout':
            final authCubit = context.read<AuthCubit>();
            unawaited(authCubit.signOut());
        }
      },
      child: CircleAvatar(
        radius: 16,
        backgroundImage: avatarUrl != null ? NetworkImage(avatarUrl) : null,
        backgroundColor: theme.colorScheme.muted,
        child: avatarUrl == null
            ? Text(
                _getInitials(name),
                style: theme.typography.large.copyWith(
                  color: theme.colorScheme.foreground,
                ),
              )
            : null,
      ),
    );
  }

  String _getInitials(String? name) {
    if (name == null || name.isEmpty) return 'U';
    return name.substring(0, 1).toUpperCase();
  }
}

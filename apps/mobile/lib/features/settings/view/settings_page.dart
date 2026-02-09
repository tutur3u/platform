import 'dart:async';

import 'package:flutter/material.dart'
    hide Scaffold, AppBar, AlertDialog, Divider, TextButton, FilledButton;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_state.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_state.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return shad.Scaffold(
      headers: [
        shad.AppBar(title: Text(l10n.settingsTitle)),
      ],
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildSettingsItem(
            context,
            icon: Icons.person_outline,
            title: l10n.settingsProfile,
            onTap: () {},
          ),
          const shad.Divider(),
          BlocBuilder<LocaleCubit, LocaleState>(
            builder: (context, localeState) {
              return _buildSettingsItem(
                context,
                icon: Icons.language,
                title: l10n.settingsLanguage,
                subtitle: _localeDisplayName(localeState.locale, l10n),
                onTap: () => _showLanguageDialog(context),
              );
            },
          ),
          const shad.Divider(),
          BlocBuilder<ThemeCubit, ThemeState>(
            builder: (context, themeState) {
              return _buildSettingsItem(
                context,
                icon: Icons.palette_outlined,
                title: l10n.settingsTheme,
                subtitle: _themeDisplayName(themeState.themeMode, l10n),
                onTap: () => _showThemeDialog(context),
              );
            },
          ),
          const shad.Divider(),
          BlocBuilder<WorkspaceCubit, WorkspaceState>(
            buildWhen: (prev, curr) =>
                prev.currentWorkspace != curr.currentWorkspace,
            builder: (context, state) {
              return _buildSettingsItem(
                context,
                icon: Icons.swap_horiz,
                title: l10n.settingsSwitchWorkspace,
                subtitle: state.currentWorkspace?.name,
                onTap: () => context.go(Routes.workspaceSelect),
              );
            },
          ),
          const shad.Divider(),
          _buildSettingsItem(
            context,
            icon: Icons.logout,
            title: l10n.settingsSignOut,
            isDestructive: true,
            onTap: () => _showSignOutDialog(context),
          ),
        ],
      ),
    );
  }

  Widget _buildSettingsItem(
    BuildContext context, {
    required IconData icon,
    required String title,
    required VoidCallback onTap,
    String? subtitle,
    bool isDestructive = false,
  }) {
    final theme = shad.Theme.of(context);
    final color = isDestructive ? theme.colorScheme.destructive : null;

    return shad.GhostButton(
      onPressed: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Icon(icon, color: color),
            const shad.Gap(16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: theme.typography.p.copyWith(color: color),
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle,
                      style: theme.typography.textMuted,
                    ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, size: 20),
          ],
        ),
      ),
    );
  }

  String _localeDisplayName(Locale? locale, AppLocalizations l10n) {
    if (locale == null) return l10n.settingsLanguageSystem;
    switch (locale.languageCode) {
      case 'en':
        return l10n.settingsLanguageEnglish;
      case 'vi':
        return l10n.settingsLanguageVietnamese;
      default:
        return locale.languageCode;
    }
  }

  String _themeDisplayName(shad.ThemeMode mode, AppLocalizations l10n) {
    switch (mode) {
      case shad.ThemeMode.light:
        return l10n.settingsThemeLight;
      case shad.ThemeMode.dark:
        return l10n.settingsThemeDark;
      case shad.ThemeMode.system:
        return l10n.settingsThemeSystem;
    }
  }

  void _showLanguageDialog(BuildContext context) {
    final l10n = context.l10n;
    final cubit = context.read<LocaleCubit>();

    unawaited(
      showDialog<void>(
        context: context,
        builder: (context) => Center(
          child: shad.AlertDialog(
            title: Text(l10n.settingsLanguage),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                shad.GhostButton(
                  onPressed: () {
                    unawaited(cubit.clearLocale());
                    Navigator.pop(context);
                  },
                  child: Text(l10n.settingsLanguageSystem),
                ),
                shad.GhostButton(
                  onPressed: () {
                    unawaited(cubit.setLocale(const Locale('en')));
                    Navigator.pop(context);
                  },
                  child: Text(l10n.settingsLanguageEnglish),
                ),
                shad.GhostButton(
                  onPressed: () {
                    unawaited(cubit.setLocale(const Locale('vi')));
                    Navigator.pop(context);
                  },
                  child: Text(l10n.settingsLanguageVietnamese),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showThemeDialog(BuildContext context) {
    final l10n = context.l10n;
    final cubit = context.read<ThemeCubit>();

    unawaited(
      showDialog<void>(
        context: context,
        builder: (context) => Center(
          child: shad.AlertDialog(
            title: Text(l10n.settingsTheme),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                shad.GhostButton(
                  onPressed: () {
                    unawaited(cubit.setThemeMode(shad.ThemeMode.light));
                    Navigator.pop(context);
                  },
                  child: Text(l10n.settingsThemeLight),
                ),
                shad.GhostButton(
                  onPressed: () {
                    unawaited(cubit.setThemeMode(shad.ThemeMode.dark));
                    Navigator.pop(context);
                  },
                  child: Text(l10n.settingsThemeDark),
                ),
                shad.GhostButton(
                  onPressed: () {
                    unawaited(cubit.setThemeMode(shad.ThemeMode.system));
                    Navigator.pop(context);
                  },
                  child: Text(l10n.settingsThemeSystem),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showSignOutDialog(BuildContext context) {
    final l10n = context.l10n;

    unawaited(
      showDialog<void>(
        context: context,
        builder: (dialogContext) => Center(
          child: shad.AlertDialog(
            title: Text(l10n.settingsSignOut),
            content: Text(l10n.settingsSignOutConfirm),
            actions: [
              shad.OutlineButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Cancel'),
              ),
              shad.DestructiveButton(
                onPressed: () {
                  Navigator.pop(dialogContext);
                  unawaited(context.read<AuthCubit>().signOut());
                },
                child: Text(l10n.settingsSignOut),
              ),
            ],
          ),
        ),
      ),
    );
  }
}



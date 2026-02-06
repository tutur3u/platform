import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_state.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.settingsTitle)),
      body: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.person_outline),
            title: Text(l10n.settingsProfile),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {},
          ),
          const Divider(),
          BlocBuilder<LocaleCubit, LocaleState>(
            builder: (context, localeState) {
              return ListTile(
                leading: const Icon(Icons.language),
                title: Text(l10n.settingsLanguage),
                subtitle: Text(
                  _localeDisplayName(localeState.locale, l10n),
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _showLanguageDialog(context),
              );
            },
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.palette_outlined),
            title: Text(l10n.settingsTheme),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _showThemeDialog(context),
          ),
          const Divider(),
          BlocBuilder<WorkspaceCubit, WorkspaceState>(
            buildWhen: (prev, curr) =>
                prev.currentWorkspace != curr.currentWorkspace,
            builder: (context, state) {
              return ListTile(
                leading: const Icon(Icons.swap_horiz),
                title: Text(l10n.settingsSwitchWorkspace),
                subtitle: state.currentWorkspace?.name != null
                    ? Text(state.currentWorkspace!.name!)
                    : null,
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.go(Routes.workspaceSelect),
              );
            },
          ),
          const Divider(),
          ListTile(
            leading: Icon(
              Icons.logout,
              color: Theme.of(context).colorScheme.error,
            ),
            title: Text(
              l10n.settingsSignOut,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
            onTap: () => _showSignOutDialog(context),
          ),
        ],
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

  void _showLanguageDialog(BuildContext context) {
    final l10n = context.l10n;
    final cubit = context.read<LocaleCubit>();

    unawaited(
      showDialog<void>(
        context: context,
        builder: (context) => SimpleDialog(
          title: Text(l10n.settingsLanguage),
          children: [
            SimpleDialogOption(
              onPressed: () {
                unawaited(cubit.clearLocale());
                Navigator.pop(context);
              },
              child: Text(l10n.settingsLanguageSystem),
            ),
            SimpleDialogOption(
              onPressed: () {
                unawaited(cubit.setLocale(const Locale('en')));
                Navigator.pop(context);
              },
              child: Text(l10n.settingsLanguageEnglish),
            ),
            SimpleDialogOption(
              onPressed: () {
                unawaited(cubit.setLocale(const Locale('vi')));
                Navigator.pop(context);
              },
              child: Text(l10n.settingsLanguageVietnamese),
            ),
          ],
        ),
      ),
    );
  }

  void _showThemeDialog(BuildContext context) {
    final l10n = context.l10n;

    unawaited(
      showDialog<void>(
        context: context,
        builder: (context) => SimpleDialog(
          title: Text(l10n.settingsTheme),
          children: [
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context),
              child: Text(l10n.settingsThemeLight),
            ),
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context),
              child: Text(l10n.settingsThemeDark),
            ),
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context),
              child: Text(l10n.settingsThemeSystem),
            ),
          ],
        ),
      ),
    );
  }

  void _showSignOutDialog(BuildContext context) {
    final l10n = context.l10n;

    unawaited(
      showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(l10n.settingsSignOut),
          content: Text(l10n.settingsSignOutConfirm),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: Text(MaterialLocalizations.of(context).cancelButtonLabel),
            ),
            FilledButton(
              onPressed: () {
                Navigator.pop(dialogContext);
                unawaited(context.read<AuthCubit>().signOut());
              },
              child: Text(l10n.settingsSignOut),
            ),
          ],
        ),
      ),
    );
  }
}

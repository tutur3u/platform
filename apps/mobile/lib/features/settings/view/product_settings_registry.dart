import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/assistant/view/assistant_settings_hub.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/mail/data/mail_access.dart';
import 'package:mobile/features/mail/view/mail_settings_hub.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/settings/view/product_preference_editors.dart';
import 'package:mobile/features/settings/view/settings_scoped_page.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// Register only products with real configurable native settings. Each entry
/// resolves its current scope and reuses the product's quick-settings editor.
class ProductSettingsEntry {
  const ProductSettingsEntry({
    required this.id,
    required this.icon,
    required this.title,
    required this.visible,
    required this.open,
  });
  final String id;
  final IconData icon;
  final String Function(BuildContext) title;
  final bool Function(BuildContext) visible;
  final Future<void> Function(BuildContext) open;
}

final productSettingsRegistry = <ProductSettingsEntry>[
  ProductSettingsEntry(
    id: 'assistant',
    icon: Icons.auto_awesome_outlined,
    title: (context) => context.l10n.navAssistant,
    visible: (context) =>
        context.read<AuthCubit>().state.user != null &&
        context.read<WorkspaceCubit>().state.currentWorkspace != null,
    open: (context) async {
      final workspaceId = context
          .read<WorkspaceCubit>()
          .state
          .currentWorkspace
          ?.id;
      if (workspaceId == null) return;
      final location = GoRouterState.of(context).matchedLocation;
      await pushScopedSettingsPage(
        context,
        builder: (_, isCurrent) => AssistantSettingsHub(
          workspaceId: workspaceId,
          locations: {location},
          isScopeCurrent: isCurrent,
        ),
      );
    },
  ),
  ProductSettingsEntry(
    id: 'calendar',
    icon: Icons.calendar_today_outlined,
    title: (context) => context.l10n.navCalendar,
    visible: (context) => context.read<CalendarSettingsCubit?>() != null,
    open: openCalendarProductSettings,
  ),
  ProductSettingsEntry(
    id: 'finance',
    icon: Icons.account_balance_wallet_outlined,
    title: (context) => context.l10n.navFinance,
    visible: (context) => context.read<FinancePreferencesCubit?>() != null,
    open: (context) => openFinanceProductSettings(
      context,
      context.read<FinancePreferencesCubit>(),
    ),
  ),
  ProductSettingsEntry(
    id: 'mail',
    icon: Icons.mail_outline,
    title: (context) => context.l10n.mailTitle,
    visible: (context) {
      final user = context.read<AuthCubit>().state.user;
      return user != null &&
          canDiscoverMail(user.email, appMetadata: user.appMetadata) &&
          context.read<WorkspaceCubit>().state.currentWorkspace != null;
    },
    open: (context) async {
      final workspaceId = context
          .read<WorkspaceCubit>()
          .state
          .currentWorkspace
          ?.id;
      if (workspaceId == null) return;
      final location = GoRouterState.of(context).matchedLocation;
      await pushScopedSettingsPage(
        context,
        builder: (_, isCurrent) => MailSettingsHub(
          workspaceId: workspaceId,
          locations: {location},
          isScopeCurrent: isCurrent,
        ),
      );
    },
  ),
];

class ProductSettingsSection extends StatelessWidget {
  const ProductSettingsSection({super.key});
  @override
  Widget build(BuildContext context) {
    context
      ..watch<AuthCubit>()
      ..watch<WorkspaceCubit>();
    final entries = productSettingsRegistry
        .where((entry) => entry.visible(context))
        .toList();
    if (entries.isEmpty) return const SizedBox.shrink();
    return SettingsCompactSection(
      title: context.l10n.settingsProductSettings,
      children: [
        for (final entry in entries)
          SettingsTile(
            key: ValueKey(entry.id),
            icon: entry.icon,
            title: entry.title(context),
            grouped: true,
            onTap: () => unawaited(entry.open(context)),
          ),
      ],
    );
  }
}

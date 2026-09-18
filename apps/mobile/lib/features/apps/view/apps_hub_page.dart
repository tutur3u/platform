import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/l10n/l10n.dart';

/// A lightweight launcher. Modules load when opened, not while browsing apps.
class AppsHubPage extends StatelessWidget {
  const AppsHubPage({this.replayToken = 0, super.key});
  final int replayToken;

  @override
  Widget build(BuildContext context) {
    final modules = AppRegistry.modules(context);
    const order = [
      'tasks',
      'chat',
      'calendar',
      'finance',
      'timer',
      'drive',
      'education',
      'inventory',
      'crm',
    ];
    final ordered = [
      for (final id in order) ...modules.where((module) => module.id == id),
      ...modules.where((module) => !order.contains(module.id)),
    ];
    final colors = Theme.of(context).colorScheme;
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: ListView.separated(
          key: const PageStorageKey('apps-launcher'),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
          itemCount: ordered.length,
          separatorBuilder: (_, _) =>
              Divider(height: 1, indent: 64, color: colors.outlineVariant),
          itemBuilder: (context, index) {
            final module = ordered[index];
            final description = _moduleDescription(context, module.id);
            return Material(
              color: colors.surfaceContainerLowest,
              borderRadius: BorderRadius.vertical(
                top: index == 0 ? const Radius.circular(16) : Radius.zero,
                bottom: index == ordered.length - 1
                    ? const Radius.circular(16)
                    : Radius.zero,
              ),
              clipBehavior: Clip.antiAlias,
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 6,
                ),
                minLeadingWidth: 36,
                leading: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: colors.primary.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(module.icon, size: 20, color: colors.primary),
                ),
                title: Text(
                  module.label(context.l10n),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: description.isEmpty
                    ? null
                    : Text(
                        description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                trailing: Icon(
                  Icons.chevron_right,
                  size: 18,
                  color: colors.onSurfaceVariant,
                ),
                onTap: () => _openModule(context, module),
              ),
            );
          },
        ),
      ),
    );
  }
}

void _openModule(BuildContext context, AppModule module) {
  unawaited(context.read<AppTabCubit>().select(module));
  context.go(module.route);
}

String _moduleDescription(BuildContext context, String moduleId) {
  return switch (moduleId) {
    'habits' => context.l10n.appsHubHabitsDescription,
    'tasks' => context.l10n.appsHubTasksDescription,
    'chat' => context.l10n.appsHubChatDescription,
    'calendar' => context.l10n.appsHubCalendarDescription,
    'cms' => context.l10n.appsHubCmsDescription,
    'finance' => context.l10n.appsHubFinanceDescription,
    'drive' => context.l10n.appsHubDriveDescription,
    'documents' => context.l10n.appsHubDocumentsDescription,
    'education' => context.l10n.appsHubEducationDescription,
    'crm' => context.l10n.appsHubCrmDescription,
    'meet' => context.l10n.appsHubMeetDescription,
    'inventory' => context.l10n.appsHubInventoryDescription,
    'notifications' => context.l10n.appsHubNotificationsDescription,
    'settings' => context.l10n.appsHubSettingsDescription,
    'timer' => context.l10n.appsHubTimerDescription,
    _ => '',
  };
}

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

/// The You tab's shortcut rows below identity and Focus Time: Workspaces
/// (with a count), Timeline and Settings. Each opens an existing surface.
class ProfileYouRows extends StatelessWidget {
  const ProfileYouRows({required this.onOpenTimeline, super.key});

  final VoidCallback onOpenTimeline;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final count = context.select<WorkspaceCubit, int>(
      (cubit) => cubit.state.workspaces.length,
    );
    return AppGroupedCard(
      children: [
        AppGroupedRow(
          key: const ValueKey('you-row-workspaces'),
          leading: const AppIconTile(
            icon: LucideIcons.layers,
            tone: AppTone.success,
          ),
          title: Text(l10n.profileYouWorkspaces),
          trailing: count == 0 ? null : Text('$count'),
          showChevron: true,
          onTap: () => showWorkspacePickerSheet(context),
        ),
        AppGroupedRow(
          key: const ValueKey('you-row-timeline'),
          leading: const AppIconTile(
            icon: LucideIcons.history,
            tone: AppTone.info,
          ),
          title: Text(l10n.profileTimelineTitle),
          showChevron: true,
          onTap: onOpenTimeline,
        ),
        AppGroupedRow(
          key: const ValueKey('you-row-settings'),
          leading: const AppIconTile(icon: LucideIcons.settings),
          title: Text(l10n.navSettings),
          showChevron: true,
          onTap: () => context.go(Routes.settings),
        ),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/l10n/l10n.dart';

/// Profile shortcuts to personal activity and Settings.
class ProfileYouRows extends StatelessWidget {
  const ProfileYouRows({required this.onOpenTimeline, super.key});

  final VoidCallback onOpenTimeline;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppGroupedCard(
      children: [
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

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/models/app_category.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/view/apps_hub_results.dart';
import 'package:mobile/features/apps/widgets/app_launcher_shortcuts.dart';
import 'package:mobile/features/apps/widgets/app_launcher_tile.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';

class AppsHubPage extends StatelessWidget {
  const AppsHubPage({
    this.query = '',
    this.onSelected,
    this.onManage,
    this.search,
    super.key,
  });

  final String query;
  final ValueChanged<AppModule>? onSelected;
  final VoidCallback? onManage;
  final Widget? search;

  // Pull to refresh also retries the workspace's app access check.
  Future<void> _refresh(BuildContext context) async {
    final access = context.read<MastermindAccessCubit?>();
    if (access == null) return;
    await access.sync(
      context.read<WorkspaceCubit?>()?.state.currentWorkspace?.id,
      quiet: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    final cubit = context.watch<AppTabCubit>();
    final state = cubit.state;
    final matching = appsHubResults(context, cubit, query);
    final hidden = state.hiddenAppIds.toSet();
    final visible = {
      for (final app in matching)
        if (!hidden.contains(app.id)) app.id: app,
    };
    final l10n = context.l10n;
    final searching = query.trim().isNotEmpty;
    final pinned = state.pinnedAppIds
        .map((id) => visible[id])
        .nonNulls
        .toList();
    final recent = state.recentAppIds
        .map((id) => visible[id])
        .nonNulls
        .take(4)
        .toList();
    final sections = <(String, String, List<AppModule>)>[
      if (searching) ...[
        ('results', l10n.appsHubSearchResults, visible.values.toList()),
        (
          'hidden',
          l10n.appsHiddenSection,
          matching.where((app) => hidden.contains(app.id)).toList(),
        ),
      ] else ...[
        for (final category in AppCategory.values)
          (
            category.name,
            category.label(l10n),
            visible.values
                .where((app) => AppCategory.forModule(app.id) == category)
                .toList(),
          ),
      ],
    ].where((section) => section.$3.isNotEmpty);

    void open(AppModule app) {
      unawaited(AppHaptics.selection());
      if (onSelected case final select?) {
        select(app);
      } else {
        unawaited(cubit.select(app));
        context.go(app.route);
      }
    }

    return NovaRefreshIndicator(
      onRefresh: () => _refresh(context),
      child: AppPageScrollView(
        kind: AppPageKind.root,
        topInset: floatingShellHeaderInset(context),
        physics: const BouncingScrollPhysics(
          parent: AlwaysScrollableScrollPhysics(),
        ),
        slivers: [
          if (search case final field?)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
                child: field,
              ),
            ),
          if (!searching && (pinned.isNotEmpty || onManage != null))
            SliverToBoxAdapter(
              key: const ValueKey('apps-section-pinned'),
              child: _AppsSection(
                title: l10n.appsPinnedSection,
                child: AppLauncherPins(
                  apps: pinned,
                  onSelected: open,
                  onManage: onManage,
                ),
              ),
            ),
          if (!searching && recent.isNotEmpty)
            SliverToBoxAdapter(
              key: const ValueKey('apps-section-recent'),
              child: _AppsSection(
                title: l10n.appsRecentSection,
                child: AppLauncherRecents(apps: recent, onSelected: open),
              ),
            ),
          if (sections.isEmpty)
            SliverToBoxAdapter(
              child: AppStateMessage(
                icon: searching ? Icons.search : Icons.apps,
                title: searching ? l10n.appsNoMatches : l10n.appsHubEmpty,
              ),
            ),
          for (final (id, title, apps) in sections)
            SliverToBoxAdapter(
              key: ValueKey('apps-section-$id'),
              child: _AppsSection(
                title: title,
                child: _AppsGrid(
                  keyPrefix: searching ? id : 'app',
                  apps: apps,
                  onSelected: open,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _AppsSection extends StatelessWidget {
  const _AppsSection({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppSectionHeader(title: title),
        child,
      ],
    ),
  );
}

class _AppsGrid extends StatelessWidget {
  const _AppsGrid({
    required this.keyPrefix,
    required this.apps,
    required this.onSelected,
  });

  final String keyPrefix;

  final List<AppModule> apps;
  final ValueChanged<AppModule> onSelected;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final width = constraints.maxWidth;
      const gap = AppSpacing.sm;
      final minWidth = 115 * MediaQuery.textScalerOf(context).scale(15) / 15;
      final maxColumns = switch (width) {
        >= 900 => 4,
        >= 592 => 3,
        _ => 2,
      };
      final columns = ((width + gap) / (minWidth + gap)).floor().clamp(
        1,
        maxColumns,
      );
      final tileWidth = (width - (columns - 1) * gap) / columns;
      return Wrap(
        spacing: gap,
        runSpacing: gap,
        children: [
          for (final module in apps)
            SizedBox(
              key: ValueKey('$keyPrefix-${module.id}'),
              width: tileWidth,
              child: AppLauncherTile(
                module: module,
                onPressed: () => onSelected(module),
              ),
            ),
        ],
      );
    },
  );
}

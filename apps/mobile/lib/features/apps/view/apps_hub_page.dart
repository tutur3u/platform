import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/models/app_description.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/widgets/app_card_palette.dart';
import 'package:mobile/features/apps/widgets/apps_picker_editor.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/staggered_entrance.dart';

class AppsHubPage extends StatefulWidget {
  const AppsHubPage({
    this.replayToken = 0,
    this.query = '',
    this.onSelected,
    super.key,
  });

  final String query;
  final ValueChanged<AppModule>? onSelected;

  final int replayToken;

  @override
  State<AppsHubPage> createState() => _AppsHubPageState();
}

class _AppsHubPageState extends State<AppsHubPage> {
  bool _showGrid = false;

  @override
  Widget build(BuildContext context) {
    final showViewLabels = MediaQuery.sizeOf(context).width >= 300;
    final modules =
        arrangeApps(AppRegistry.modules(context), context.watch<AppTabCubit>())
            .where(
              (module) =>
                  '${module.label(context.l10n)} '
                          '${appDescription(context, module.id)} ${module.id}'
                      .toLowerCase()
                      .contains(widget.query.trim().toLowerCase()),
            )
            .toList();

    return SafeArea(
      top: false,
      bottom: false,
      child: ResponsiveWrapper(
        maxWidth: ResponsivePadding.rootContentWidth(context.deviceClass),
        child: IgnorePointer(
          ignoring: false,
          child: CustomScrollView(
            physics: const BouncingScrollPhysics(
              parent: AlwaysScrollableScrollPhysics(),
            ),
            slivers: [
              SliverToBoxAdapter(
                child: SizedBox(height: floatingShellHeaderInset(context)),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.fromLTRB(
                    ResponsivePadding.horizontal(context.deviceClass),
                    10,
                    ResponsivePadding.horizontal(context.deviceClass),
                    0,
                  ),
                  child: Align(
                    alignment: AlignmentDirectional.centerEnd,
                    child: SegmentedButton<bool>(
                      showSelectedIcon: false,
                      segments: [
                        ButtonSegment(
                          value: false,
                          icon: const Icon(Icons.view_agenda_rounded),
                          label: showViewLabels
                              ? Text(context.l10n.appsHubListView)
                              : null,
                          tooltip: context.l10n.appsHubListView,
                        ),
                        ButtonSegment(
                          value: true,
                          icon: const Icon(Icons.grid_view_rounded),
                          label: showViewLabels
                              ? Text(context.l10n.appsHubGridView)
                              : null,
                          tooltip: context.l10n.appsHubGridView,
                        ),
                      ],
                      selected: {_showGrid},
                      onSelectionChanged: (selection) {
                        setState(() => _showGrid = selection.single);
                      },
                    ),
                  ),
                ),
              ),
              if (modules.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(child: Text(context.l10n.appsNoMatches)),
                ),
              SliverPadding(
                padding: EdgeInsets.fromLTRB(
                  ResponsivePadding.horizontal(context.deviceClass),
                  10,
                  ResponsivePadding.horizontal(context.deviceClass),
                  24 + MediaQuery.paddingOf(context).bottom,
                ),
                sliver: SliverLayoutBuilder(
                  builder: (context, constraints) {
                    if (_showGrid) {
                      final columns = (constraints.crossAxisExtent / 96)
                          .floor()
                          .clamp(1, 6);
                      final labelStyle = Theme.of(
                        context,
                      ).textTheme.labelMedium;
                      final labelHeight =
                          MediaQuery.textScalerOf(
                            context,
                          ).scale(labelStyle?.fontSize ?? 14) *
                          (labelStyle?.height ?? 1.2) *
                          2;
                      return SliverGrid(
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: columns,
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          mainAxisExtent: 64 + 8 + labelHeight + 12,
                        ),
                        delegate: SliverChildBuilderDelegate(
                          (context, index) => _AppGridTile(
                            module: modules[index],
                            index: index,
                            onSelected: widget.onSelected,
                          ),
                          childCount: modules.length,
                        ),
                      );
                    }
                    final columns = (constraints.crossAxisExtent / 280)
                        .floor()
                        .clamp(1, 3);
                    return SliverList(
                      delegate: SliverChildBuilderDelegate((context, index) {
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 14),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              for (
                                var column = 0;
                                column < columns;
                                column++
                              ) ...[
                                if (column > 0) const SizedBox(width: 14),
                                Expanded(
                                  child:
                                      index * columns + column < modules.length
                                      ? _AppEditorialCard(
                                          module:
                                              modules[index * columns + column],
                                          index: index * columns + column,
                                          replayToken: widget.replayToken,
                                          onSelected: widget.onSelected,
                                        )
                                      : const SizedBox.shrink(),
                                ),
                              ],
                            ],
                          ),
                        );
                      }, childCount: (modules.length / columns).ceil()),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AppGridTile extends StatelessWidget {
  const _AppGridTile({
    required this.module,
    required this.index,
    this.onSelected,
  });

  final AppModule module;
  final int index;
  final ValueChanged<AppModule>? onSelected;

  @override
  Widget build(BuildContext context) {
    final palette = AppCardPalette.resolve(
      context,
      index: index,
      moduleId: module.id,
    );

    return Semantics(
      button: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => onSelected != null
            ? onSelected!(module)
            : _openModule(context, module),
        child: Column(
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: palette.background,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: palette.border),
                boxShadow: [
                  BoxShadow(
                    color: palette.shadow,
                    blurRadius: 12,
                    offset: const Offset(0, 5),
                  ),
                ],
              ),
              child: Icon(module.icon, color: palette.iconColor, size: 30),
            ),
            const SizedBox(height: 8),
            Text(
              module.label(context.l10n),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                fontWeight: FontWeight.w700,
                height: 1.12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AppEditorialCard extends StatelessWidget {
  const _AppEditorialCard({
    required this.module,
    required this.index,
    required this.replayToken,
    this.onSelected,
  });

  final AppModule module;
  final ValueChanged<AppModule>? onSelected;
  final int index;
  final int replayToken;

  @override
  Widget build(BuildContext context) {
    final palette = AppCardPalette.resolve(
      context,
      index: index,
      moduleId: module.id,
    );
    final surfaceColor = Color.alphaBlend(
      palette.shadow.withValues(alpha: 0.22),
      palette.background,
    );

    return StaggeredEntrance(
      replayKey: '$replayToken-$index',
      delay: Duration(milliseconds: 40 + (index * 28)),
      child: InkWell(
        borderRadius: BorderRadius.circular(26),
        onTap: () => onSelected != null
            ? onSelected!(module)
            : _openModule(context, module),
        child: Material(
          color: surfaceColor,
          borderRadius: BorderRadius.circular(26),
          clipBehavior: Clip.antiAlias,
          child: Container(
            constraints: const BoxConstraints(minHeight: 126),
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(26),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color.alphaBlend(
                    palette.iconBackground.withValues(alpha: 0.14),
                    palette.background,
                  ),
                  surfaceColor,
                ],
              ),
              border: Border.all(color: palette.border.withValues(alpha: 0.95)),
              boxShadow: [
                BoxShadow(
                  color: palette.shadow,
                  blurRadius: 18,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: Row(
              children: [
                Container(
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(
                    color: palette.iconBackground,
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Icon(module.icon, color: palette.iconColor, size: 28),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        module.label(context.l10n),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          color: palette.textColor,
                          fontWeight: FontWeight.w900,
                          height: 1.05,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        appDescription(context, module.id),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: palette.textColor.withValues(alpha: 0.8),
                          height: 1.34,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

void _openModule(BuildContext context, AppModule module) {
  unawaited(context.read<AppTabCubit>().select(module));
  context.go(module.route);
}

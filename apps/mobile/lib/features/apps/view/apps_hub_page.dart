import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/widgets/app_card_palette.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AppsHubPage extends StatelessWidget {
  const AppsHubPage({super.key});

  @override
  Widget build(BuildContext context) {
    final modules = AppRegistry.modules(context);

    return shad.Scaffold(
      child: SafeArea(
        top: false,
        bottom: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            ResponsivePadding.horizontal(context.deviceClass),
            10,
            ResponsivePadding.horizontal(context.deviceClass),
            24 + MediaQuery.paddingOf(context).bottom,
          ),
          child: CustomScrollView(
            physics: const BouncingScrollPhysics(),
            slivers: [
              const SliverToBoxAdapter(child: _AppsIntro()),
              const SliverToBoxAdapter(child: SizedBox(height: 16)),
              if (context.deviceClass == DeviceClass.compact)
                SliverToBoxAdapter(child: _CompactAppsGrid(modules: modules))
              else
                SliverGrid(
                  delegate: SliverChildBuilderDelegate((context, index) {
                    return _SubproductCard(
                      module: modules[index],
                      index: index,
                    );
                  }, childCount: modules.length),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: context.deviceClass == DeviceClass.expanded
                        ? 4
                        : 3,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    childAspectRatio:
                        context.deviceClass == DeviceClass.expanded ? 1.1 : 1.0,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CompactAppsGrid extends StatelessWidget {
  const _CompactAppsGrid({required this.modules});

  final List<AppModule> modules;

  @override
  Widget build(BuildContext context) {
    final featuredTaskIndex = modules.indexWhere(
      (module) => module.id == 'tasks',
    );
    final featuredModule = featuredTaskIndex >= 0
        ? modules[featuredTaskIndex]
        : null;
    final remainingModules = [
      for (var index = 0; index < modules.length; index++)
        if (index != featuredTaskIndex) (index, modules[index]),
    ];
    final rows = <Widget>[];

    if (featuredModule != null) {
      rows.add(
        SizedBox(
          height: 186,
          child: _SubproductCard(
            module: featuredModule,
            index: featuredTaskIndex,
            featured: true,
          ),
        ),
      );
    }

    for (var index = 0; index < remainingModules.length; index += 2) {
      final first = remainingModules[index];
      final second = index + 1 < remainingModules.length
          ? remainingModules[index + 1]
          : null;

      if (second == null) {
        rows.add(
          SizedBox(
            height: 164,
            child: _SubproductCard(module: first.$2, index: first.$1),
          ),
        );
        continue;
      }

      rows.add(
        SizedBox(
          height: 172,
          child: Row(
            children: [
              Expanded(
                child: _SubproductCard(module: first.$2, index: first.$1),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _SubproductCard(module: second.$2, index: second.$1),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      children: [
        for (var index = 0; index < rows.length; index++) ...[
          rows[index],
          if (index < rows.length - 1) const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class _AppsIntro extends StatelessWidget {
  const _AppsIntro();

  @override
  Widget build(BuildContext context) {
    // Shell already shows the title in the app bar, so we don't need to
    // duplicate it here. Return empty widget.
    return const SizedBox.shrink();
  }
}

class _SubproductCard extends StatelessWidget {
  const _SubproductCard({
    required this.module,
    required this.index,
    this.featured = false,
  });

  final AppModule module;
  final int index;
  final bool featured;

  @override
  Widget build(BuildContext context) {
    final palette = AppCardPalette.resolve(
      context,
      index: index,
      moduleId: module.id,
    );

    return InkWell(
      borderRadius: BorderRadius.circular(26),
      onTap: () {
        unawaited(context.read<AppTabCubit>().select(module));
        context.go(module.route);
      },
      child: Material(
        color: palette.background,
        borderRadius: BorderRadius.circular(26),
        clipBehavior: Clip.antiAlias,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(26),
            border: Border.all(color: palette.border),
            boxShadow: [
              BoxShadow(
                color: palette.shadow,
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: palette.iconBackground,
                      borderRadius: BorderRadius.circular(15),
                    ),
                    child: Icon(
                      module.icon,
                      color: palette.iconColor,
                      size: 22,
                    ),
                  ),
                ],
              ),
              SizedBox(height: featured ? 14 : 8),
              Text(
                module.label(context.l10n),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style:
                    (featured
                            ? Theme.of(context).textTheme.headlineSmall
                            : Theme.of(context).textTheme.titleMedium)
                        ?.copyWith(
                          color: palette.textColor,
                          fontWeight: FontWeight.w800,
                        ),
              ),
              SizedBox(height: featured ? 10 : 8),
              Expanded(
                child: Text(
                  _description(context, module.id),
                  maxLines: featured ? 3 : 4,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: palette.textColor.withValues(alpha: 0.78),
                    height: 1.28,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _description(BuildContext context, String moduleId) {
    return switch (moduleId) {
      'habits' => context.l10n.appsHubHabitsDescription,
      'tasks' => context.l10n.appsHubTasksDescription,
      'calendar' => context.l10n.appsHubCalendarDescription,
      'finance' => context.l10n.appsHubFinanceDescription,
      'timer' => context.l10n.appsHubTimerDescription,
      _ => '',
    };
  }
}

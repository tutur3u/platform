import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/kit/app_section_header.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/models/app_category.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/widgets/app_visibility_button.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

List<AppModule> arrangeApps(List<AppModule> modules, AppTabCubit cubit) {
  const preferred = [
    'tasks',
    'calendar',
    'drive',
    'documents',
    'timer',
    'notes',
    'crm',
    'cms',
    'finance',
    'inventory',
    'mail',
    'chat',
    'meet',
    'education',
    'habits',
  ];
  final order = cubit.state.appOrder;
  final hidden = cubit.state.hiddenAppIds;
  final original = {for (var i = 0; i < modules.length; i++) modules[i].id: i};
  int rank(String id) {
    final index = order.indexOf(id);
    if (index >= 0) return index;
    final defaultIndex = preferred.indexOf(id);
    return order.length +
        (defaultIndex < 0 ? preferred.length + original[id]! : defaultIndex);
  }

  return [...modules]..sort((a, b) {
    final aHidden = hidden.contains(a.id);
    final bHidden = hidden.contains(b.id);
    if (aHidden != bHidden) return aHidden ? 1 : -1;
    return rank(a.id).compareTo(rank(b.id));
  });
}

class AppsPickerEditor extends StatelessWidget {
  const AppsPickerEditor({super.key});

  @override
  Widget build(BuildContext context) {
    final cubit = context.watch<AppTabCubit>();
    final experiments = context.watch<ExperimentalAppsCubit?>();
    final available = AppRegistry.modules(context);
    final availableIds = available.map((module) => module.id).toSet();
    final all = arrangeApps([
      ...available,
      ...AppRegistry.experimentalModules.where(
        (module) => !availableIds.contains(module.id),
      ),
    ], cubit);
    final shown = all
        .where(
          (module) =>
              availableIds.contains(module.id) &&
              !cubit.state.hiddenAppIds.contains(module.id),
        )
        .toList();
    final hiddenApps = all
        .where(
          (module) =>
              !AppRegistry.experimentalModuleIds.contains(module.id) &&
              cubit.state.hiddenAppIds.contains(module.id),
        )
        .toList();
    final hiddenExperiments = all
        .where(
          (module) =>
              AppRegistry.experimentalModuleIds.contains(module.id) &&
              (!availableIds.contains(module.id) ||
                  cubit.state.hiddenAppIds.contains(module.id)),
        )
        .toList();
    final groups = <AppCategory, List<AppModule>>{};
    for (final module in shown) {
      (groups[AppCategory.forModule(module.id)] ??= []).add(module);
    }

    return CustomScrollView(
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.sm,
            AppSpacing.lg,
            0,
          ),
          sliver: SliverMainAxisGroup(
            slivers: [
              for (final category in AppCategory.values)
                if (groups[category] case final modules?) ...[
                  SliverToBoxAdapter(
                    child: AppSectionHeader(
                      title: category.label(context.l10n),
                    ),
                  ),
                  SliverReorderableList(
                    key: ValueKey(category),
                    itemCount: modules.length,
                    proxyDecorator: (child, _, _) => Material(
                      color: AppTokens.of(context).colorScheme.card,
                      child: child,
                    ),
                    onReorderItem: (oldIndex, newIndex) {
                      final reordered = [...modules];
                      final moved = reordered.removeAt(oldIndex);
                      reordered.insert(newIndex, moved);
                      unawaited(
                        cubit.setAppOrder([
                          for (final group in AppCategory.values)
                            for (final module
                                in (group == category
                                        ? reordered
                                        : groups[group]) ??
                                    const <AppModule>[])
                              module.id,
                        ]),
                      );
                    },
                    itemBuilder: (context, index) => _AppEditorRow(
                      key: ValueKey(modules[index].id),
                      module: modules[index],
                      apps: cubit,
                      experiments: experiments,
                      dragIndex: modules.length > 1 ? index : null,
                    ),
                  ),
                ],
              for (final (title, modules) in [
                (context.l10n.appsHiddenSection, hiddenApps),
                (context.l10n.appsHiddenExperimentsSection, hiddenExperiments),
              ])
                if (modules.isNotEmpty) ...[
                  SliverToBoxAdapter(child: AppSectionHeader(title: title)),
                  SliverList.list(
                    children: [
                      for (final module in modules)
                        _AppEditorRow(
                          key: ValueKey(module.id),
                          module: module,
                          apps: cubit,
                          experiments: experiments,
                          hidden: true,
                        ),
                    ],
                  ),
                ],
            ],
          ),
        ),
        SliverToBoxAdapter(
          child: SizedBox(
            height: AppSpacing.sm + MediaQuery.paddingOf(context).bottom,
          ),
        ),
      ],
    );
  }
}

class _AppEditorRow extends StatelessWidget {
  const _AppEditorRow({
    required this.module,
    required this.apps,
    required this.experiments,
    super.key,
    this.hidden = false,
    this.dragIndex,
  });

  final AppModule module;
  final AppTabCubit apps;
  final ExperimentalAppsCubit? experiments;
  final bool hidden;
  final int? dragIndex;

  @override
  Widget build(BuildContext context) {
    final canShow =
        !hidden ||
        !AppRegistry.experimentalModuleIds.contains(module.id) ||
        (experiments != null &&
            AppRegistry.experimentalAccessAvailable(context, module.id));
    final pinned = apps.state.pinnedAppIds.contains(module.id);
    final label = module.label(context.l10n);

    return ListTile(
      leading: Icon(module.icon),
      title: Text(label),
      textColor: hidden ? Theme.of(context).colorScheme.onSurfaceVariant : null,
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!hidden)
            AppIconButton(
              icon: Icon(pinned ? Icons.push_pin : Icons.push_pin_outlined),
              tooltip: pinned
                  ? context.l10n.appsUnpin(label)
                  : context.l10n.appsPin(label),
              onPressed: () async {
                final saved = await apps.setAppPinned(
                  module.id,
                  pinned: !pinned,
                );
                if (!saved && context.mounted) {
                  showAppToast(
                    context,
                    message: context.l10n.appsPinSaveFailed,
                    variant: AppAlertVariant.destructive,
                  );
                }
              },
            ),
          AppVisibilityButton(
            hidden: hidden,
            onPressed: canShow
                ? () => unawaited(
                    _changeEditorVisibility(
                      context: context,
                      apps: apps,
                      experiments: experiments,
                      module: module,
                      hidden: hidden,
                    ),
                  )
                : null,
          ),
          if (dragIndex case final index?)
            ReorderableDragStartListener(
              index: index,
              child: Tooltip(
                message: context.l10n.appsReorder,
                child: const SizedBox.square(
                  dimension: 48,
                  child: Icon(Icons.drag_handle_rounded),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

Future<void> _changeEditorVisibility({
  required BuildContext context,
  required AppTabCubit apps,
  required ExperimentalAppsCubit? experiments,
  required AppModule module,
  required bool hidden,
}) async {
  if (!hidden && !await confirmHideApp(context)) return;
  if (!context.mounted) return;
  if (hidden && AppRegistry.experimentalModuleIds.contains(module.id)) {
    await experiments?.setModuleEnabled(moduleId: module.id, enabled: true);
  }
  await apps.setAppHidden(module.id, hidden: !hidden);
}

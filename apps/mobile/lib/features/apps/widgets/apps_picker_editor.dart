import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
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
    final modules = [...shown, ...hiddenApps, ...hiddenExperiments];
    final shownCount = shown.length;
    final experimentAccess = {
      for (final module in hiddenExperiments)
        module.id: AppRegistry.experimentalAccessAvailable(context, module.id),
    };
    // Hosted below the order editor sheet's own title row, so it needs no
    // floating shell header clearance.
    return ReorderableListView.builder(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.sm,
        AppSpacing.lg,
        AppSpacing.sm + MediaQuery.paddingOf(context).bottom,
      ),
      buildDefaultDragHandles: false,
      itemCount: modules.length,
      onReorderItem: (oldIndex, newIndex) {
        if (oldIndex >= shownCount || shownCount < 2) return;
        final moved = modules.removeAt(oldIndex);
        modules.insert(newIndex.clamp(0, shownCount - 1), moved);
        unawaited(cubit.setAppOrder(modules.map((app) => app.id).toList()));
      },
      itemBuilder: (context, index) {
        final module = modules[index];
        final hidden = index >= shownCount;
        final canShow =
            !hidden ||
            !AppRegistry.experimentalModuleIds.contains(module.id) ||
            (experiments != null && experimentAccess[module.id] == true);
        final pinned = cubit.state.pinnedAppIds.contains(module.id);
        final label = module.label(context.l10n);
        return Column(
          key: ValueKey(module.id),
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (hiddenApps.isNotEmpty && index == shownCount) ...[
              const Divider(height: 24),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                child: Text(
                  context.l10n.appsHiddenSection,
                  style: Theme.of(context).textTheme.labelLarge,
                ),
              ),
            ],
            if (hiddenExperiments.isNotEmpty &&
                index == shownCount + hiddenApps.length) ...[
              const Divider(height: 24),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                child: Text(
                  context.l10n.appsHiddenExperimentsSection,
                  style: Theme.of(context).textTheme.labelLarge,
                ),
              ),
            ],
            ListTile(
              leading: Icon(module.icon),
              title: Text(label),
              textColor: hidden
                  ? Theme.of(context).colorScheme.onSurfaceVariant
                  : null,
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (!hidden)
                    AppIconButton(
                      icon: Icon(
                        pinned ? Icons.push_pin : Icons.push_pin_outlined,
                      ),
                      tooltip: pinned
                          ? context.l10n.appsUnpin(label)
                          : context.l10n.appsPin(label),
                      onPressed: () => unawaited(
                        cubit.setAppPinned(module.id, pinned: !pinned),
                      ),
                    ),
                  AppVisibilityButton(
                    hidden: hidden,
                    onPressed: canShow
                        ? () => unawaited(
                            _changeEditorVisibility(
                              context: context,
                              apps: cubit,
                              experiments: experiments,
                              module: module,
                              hidden: hidden,
                            ),
                          )
                        : null,
                  ),
                  if (!hidden)
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
            ),
          ],
        );
      },
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

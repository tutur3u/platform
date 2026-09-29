import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/widgets/app_visibility_button.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/l10n/l10n.dart';

List<AppModule> arrangeApps(List<AppModule> modules, AppTabCubit cubit) {
  const preferred = [
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

Future<void> changeAppVisibility(
  BuildContext context,
  AppTabCubit cubit,
  AppModule module, {
  required bool hidden,
}) async {
  if (!hidden && !await confirmHideApp(context)) return;
  if (!context.mounted) return;
  await cubit.setAppHidden(module.id, hidden: !hidden);
}

class AppsPickerEditor extends StatelessWidget {
  const AppsPickerEditor({super.key});

  @override
  Widget build(BuildContext context) {
    final cubit = context.watch<AppTabCubit>();
    final modules = arrangeApps(AppRegistry.modules(context), cubit);
    final shownCount = modules
        .where((module) => !cubit.state.hiddenAppIds.contains(module.id))
        .length;
    return ReorderableListView.builder(
      padding: EdgeInsets.fromLTRB(
        16,
        floatingShellHeaderInset(context) + 8,
        16,
        8 + MediaQuery.paddingOf(context).bottom,
      ),
      buildDefaultDragHandles: false,
      itemCount: modules.length,
      onReorderItem: (oldIndex, newIndex) {
        if (oldIndex >= shownCount) return;
        final moved = modules.removeAt(oldIndex);
        modules.insert(newIndex.clamp(0, shownCount - 1), moved);
        unawaited(cubit.setAppOrder(modules.map((app) => app.id).toList()));
      },
      itemBuilder: (context, index) {
        final module = modules[index];
        final hidden = cubit.state.hiddenAppIds.contains(module.id);
        return Column(
          key: ValueKey(module.id),
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (hidden && index == shownCount) ...[
              const Divider(height: 24),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                child: Text(
                  context.l10n.appsHiddenSection,
                  style: Theme.of(context).textTheme.labelLarge,
                ),
              ),
            ],
            ListTile(
              leading: Icon(module.icon),
              title: Text(module.label(context.l10n)),
              textColor: hidden
                  ? Theme.of(context).colorScheme.onSurfaceVariant
                  : null,
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  AppVisibilityButton(
                    hidden: hidden,
                    onPressed: () => unawaited(
                      changeAppVisibility(
                        context,
                        cubit,
                        module,
                        hidden: hidden,
                      ),
                    ),
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

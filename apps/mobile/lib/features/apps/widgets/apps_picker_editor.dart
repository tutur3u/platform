import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
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
  final pinned = cubit.state.pinnedApps;
  final original = {for (var i = 0; i < modules.length; i++) modules[i].id: i};
  int rank(String id) {
    final index = order.indexOf(id);
    if (index >= 0) return index;
    final defaultIndex = preferred.indexOf(id);
    return order.length +
        (defaultIndex < 0 ? preferred.length + original[id]! : defaultIndex);
  }

  return [...modules]..sort((a, b) {
    final aPinned = pinned.contains(a.id);
    final bPinned = pinned.contains(b.id);
    if (aPinned != bPinned) return aPinned ? -1 : 1;
    return rank(a.id).compareTo(rank(b.id));
  });
}

class AppsPickerEditor extends StatelessWidget {
  const AppsPickerEditor({super.key});

  @override
  Widget build(BuildContext context) {
    final cubit = context.watch<AppTabCubit>();
    final modules = arrangeApps(AppRegistry.modules(context), cubit);
    return ReorderableListView.builder(
      padding: EdgeInsets.fromLTRB(
        16,
        8,
        16,
        8 + MediaQuery.paddingOf(context).bottom,
      ),
      buildDefaultDragHandles: false,
      itemCount: modules.length,
      onReorderItem: (oldIndex, newIndex) {
        final moved = modules.removeAt(oldIndex);
        modules.insert(newIndex, moved);
        unawaited(cubit.setAppOrder(modules.map((app) => app.id).toList()));
      },
      itemBuilder: (context, index) {
        final module = modules[index];
        final pinned = cubit.state.pinnedApps.contains(module.id);
        return ListTile(
          key: ValueKey(module.id),
          leading: Icon(module.icon),
          title: Text(module.label(context.l10n)),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                tooltip: pinned ? context.l10n.appsUnpin : context.l10n.appsPin,
                onPressed: () => unawaited(cubit.togglePinnedApp(module.id)),
                icon: Icon(pinned ? Icons.push_pin : Icons.push_pin_outlined),
              ),
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
      },
    );
  }
}

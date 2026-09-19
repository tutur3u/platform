import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/models/app_description.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/l10n/l10n.dart';

/// Switch apps without leaving the current page first.
class AppsDropdownPicker extends StatelessWidget {
  const AppsDropdownPicker({super.key});

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return MenuAnchor(
      consumeOutsideTap: true,
      menuChildren: [
        SizedBox(
          width: math.min(380, size.width - 32),
          height: math.min(
            520,
            (size.height - MediaQuery.viewInsetsOf(context).bottom) * 0.65,
          ),
          child: _AppChoices(
            modules: AppRegistry.modules(context),
            onSelected: (module) {
              unawaited(context.read<AppTabCubit>().select(module));
              context.go(module.route);
            },
          ),
        ),
      ],
      builder: (context, controller, child) => IconButton(
        tooltip: context.l10n.navApps,
        onPressed: () =>
            controller.isOpen ? controller.close() : controller.open(),
        icon: const Icon(Icons.apps_rounded),
      ),
    );
  }
}

class _AppChoices extends StatefulWidget {
  const _AppChoices({required this.modules, required this.onSelected});

  final List<AppModule> modules;
  final ValueChanged<AppModule> onSelected;

  @override
  State<_AppChoices> createState() => _AppChoicesState();
}

class _AppChoicesState extends State<_AppChoices> {
  String _query = '';
  final _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final modules = widget.modules.where((module) {
      final text =
          '${module.label(context.l10n)} '
          '${appDescription(context, module.id)} ${module.id}';
      return text.toLowerCase().contains(_query);
    }).toList();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            decoration: InputDecoration(
              hintText: context.l10n.appsHubSearchHint,
              prefixIcon: const Icon(Icons.search_rounded),
              isDense: true,
            ),
            onChanged: (value) =>
                setState(() => _query = value.trim().toLowerCase()),
          ),
        ),
        Expanded(
          child: modules.isEmpty
              ? Center(child: Text(context.l10n.appsHubEmpty))
              : ListView.builder(
                  controller: _scrollController,
                  primary: false,
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  itemCount: modules.length,
                  itemBuilder: (context, index) {
                    final module = modules[index];
                    return MenuItemButton(
                      leadingIcon: Icon(module.icon, size: 22),
                      onPressed: () => widget.onSelected(module),
                      child: SizedBox(
                        width: math.min(
                          280,
                          MediaQuery.sizeOf(context).width - 112,
                        ),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(module.label(context.l10n)),
                              Text(
                                appDescription(context, module.id),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

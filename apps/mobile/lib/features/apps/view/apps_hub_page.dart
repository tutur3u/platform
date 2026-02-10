import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AppsHubPage extends StatefulWidget {
  const AppsHubPage({super.key});

  @override
  State<AppsHubPage> createState() => _AppsHubPageState();
}

class _AppsHubPageState extends State<AppsHubPage> {
  late final TextEditingController _searchController;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final width = MediaQuery.sizeOf(context).width;
    final crossAxisCount = width >= 900 ? 4 : (width >= 600 ? 3 : 2);
    final normalizedQuery = _query.trim().toLowerCase();
    final modules = AppRegistry.modules(context);
    final filteredModules = normalizedQuery.isEmpty
        ? modules
        : modules
              .where(
                (module) =>
                    module.label(l10n).toLowerCase().contains(normalizedQuery),
              )
              .toList(growable: false);
    final pinnedModules = normalizedQuery.isEmpty
        ? AppRegistry.pinnedModules(context)
        : const <AppModule>[];

    return shad.Scaffold(
      headers: [
        shad.AppBar(title: Text(l10n.navApps)),
      ],
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              shad.TextField(
                controller: _searchController,
                hintText: l10n.appsHubSearchHint,
                onChanged: (value) => setState(() => _query = value),
              ),
              const shad.Gap(16),
              Expanded(
                child: CustomScrollView(
                  slivers: _buildSlivers(
                    context,
                    theme,
                    l10n,
                    pinnedModules,
                    filteredModules,
                    crossAxisCount,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _buildSlivers(
    BuildContext context,
    shad.ThemeData theme,
    AppLocalizations l10n,
    List<AppModule> pinnedModules,
    List<AppModule> filteredModules,
    int crossAxisCount,
  ) {
    if (filteredModules.isEmpty) {
      return [
        SliverFillRemaining(
          child: Center(
            child: Text(
              l10n.appsHubEmpty,
              style: theme.typography.textLarge,
            ),
          ),
        ),
      ];
    }

    final slivers = <Widget>[];

    if (pinnedModules.isNotEmpty) {
      slivers
        ..add(_SectionHeader(title: l10n.appsHubQuickAccess))
        ..add(
          SliverPadding(
            padding: const EdgeInsets.only(bottom: 20),
            sliver: _AppGrid(
              modules: pinnedModules,
              crossAxisCount: crossAxisCount,
            ),
          ),
        );
    }

    slivers
      ..add(_SectionHeader(title: l10n.appsHubAllApps))
      ..add(
        _AppGrid(
          modules: filteredModules,
          crossAxisCount: crossAxisCount,
        ),
      );

    return slivers;
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Text(
          title,
          style: shad.Theme.of(context).typography.textLarge,
        ),
      ),
    );
  }
}

class _AppGrid extends StatelessWidget {
  const _AppGrid({required this.modules, required this.crossAxisCount});

  final List<AppModule> modules;
  final int crossAxisCount;

  @override
  Widget build(BuildContext context) {
    return SliverGrid(
      delegate: SliverChildBuilderDelegate(
        (context, index) {
          final module = modules[index];
          return _AppCard(module: module);
        },
        childCount: modules.length,
      ),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 1.1,
      ),
    );
  }
}

class _AppCard extends StatelessWidget {
  const _AppCard({required this.module});

  final AppModule module;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return shad.CardButton(
      onPressed: () {
        unawaited(context.read<AppTabCubit>().select(module));
        context.go(module.route);
      },
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(module.icon, size: 32),
          const shad.Gap(8),
          Text(
            module.label(l10n),
            textAlign: TextAlign.center,
            style: shad.Theme.of(context).typography.small.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

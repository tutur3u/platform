import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_warmup_coordinator.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/widgets/app_card_palette.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/staggered_entrance.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AppsHubPage extends StatefulWidget {
  const AppsHubPage({
    this.replayToken = 0,
    super.key,
  });

  final int replayToken;

  @override
  State<AppsHubPage> createState() => _AppsHubPageState();
}

class _AppsHubPageState extends State<AppsHubPage> {
  Timer? _tapShieldTimer;
  var _tapShieldActive = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(CacheWarmupCoordinator.instance.prewarmModule('apps'));
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      final routeAnimation = ModalRoute.of(context)?.animation;
      final isTransitioning =
          routeAnimation != null &&
          (routeAnimation.isAnimating ||
              routeAnimation.status == AnimationStatus.forward);
      if (!isTransitioning) {
        return;
      }

      setState(() {
        _tapShieldActive = true;
      });

      _tapShieldTimer = Timer(const Duration(milliseconds: 600), () {
        if (!mounted) {
          return;
        }
        setState(() {
          _tapShieldActive = false;
        });
      });
    });
  }

  @override
  void dispose() {
    _tapShieldTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final modules = _orderedModules(AppRegistry.modules(context));

    return shad.Scaffold(
      child: SafeArea(
        top: false,
        bottom: false,
        child: ResponsiveWrapper(
          maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
          child: IgnorePointer(
            ignoring: _tapShieldActive,
            child: CustomScrollView(
              physics: const BouncingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics(),
              ),
              slivers: [
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    ResponsivePadding.horizontal(context.deviceClass),
                    10,
                    ResponsivePadding.horizontal(context.deviceClass),
                    24 + MediaQuery.paddingOf(context).bottom,
                  ),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate((context, index) {
                      return Padding(
                        padding: EdgeInsets.only(
                          bottom: index == modules.length - 1 ? 0 : 14,
                        ),
                        child: _AppEditorialCard(
                          module: modules[index],
                          index: index,
                          replayToken: widget.replayToken,
                        ),
                      );
                    }, childCount: modules.length),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<AppModule> _orderedModules(List<AppModule> modules) {
    const preferredOrder = <String>[
      'tasks',
      'calendar',
      'finance',
      'timer',
      'drive',
      'education',
      'inventory',
      'crm',
    ];

    final moduleById = {
      for (final module in modules) module.id: module,
    };
    final ordered = <AppModule>[];
    final seen = <String>{};

    for (final id in preferredOrder) {
      final module = moduleById[id];
      if (module != null && seen.add(module.id)) {
        ordered.add(module);
      }
    }

    for (final module in modules) {
      if (seen.add(module.id)) {
        ordered.add(module);
      }
    }

    return ordered;
  }
}

class _AppEditorialCard extends StatelessWidget {
  const _AppEditorialCard({
    required this.module,
    required this.index,
    required this.replayToken,
  });

  final AppModule module;
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
        onTap: () => _openModule(context, module),
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
                  child: Icon(
                    module.icon,
                    color: palette.iconColor,
                    size: 28,
                  ),
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
                        _moduleDescription(context, module.id),
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

String _moduleDescription(BuildContext context, String moduleId) {
  return switch (moduleId) {
    'habits' => context.l10n.appsHubHabitsDescription,
    'tasks' => context.l10n.appsHubTasksDescription,
    'calendar' => context.l10n.appsHubCalendarDescription,
    'cms' => context.l10n.appsHubCmsDescription,
    'finance' => context.l10n.appsHubFinanceDescription,
    'drive' => context.l10n.appsHubDriveDescription,
    'documents' => context.l10n.appsHubDocumentsDescription,
    'education' => context.l10n.appsHubEducationDescription,
    'crm' => context.l10n.appsHubCrmDescription,
    'meet' => context.l10n.appsHubMeetDescription,
    'inventory' => context.l10n.appsHubInventoryDescription,
    'notifications' => context.l10n.appsHubNotificationsDescription,
    'settings' => context.l10n.appsHubSettingsDescription,
    'timer' => context.l10n.appsHubTimerDescription,
    _ => '',
  };
}
